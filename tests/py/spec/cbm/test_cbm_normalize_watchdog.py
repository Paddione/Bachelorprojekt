"""K1 repo-graph-label-cleanup (P1): Watchdog normalisiert Daemon-Rebuilds.

Der CLI-Pfad (cbm-single-flight.sh) normalisiert bereits; Rebuilds ueber den
CBM-Daemon umgehen ihn. Der Watchdog (scripts/mcp/cbm-normalize-watchdog.py)
folgt dem Daemon-Log und normalisiert nach jedem Index-Lauf.

Pruefmodus: command output verification (T002448-M4) — Tests laden das Script
als Modul und pruefen Verhalten (Parsing, Scope, Ruhe-Check, dry-run, Retry,
echter Normalizer-Lauf auf Fixture-DB), keine Script-Internals.
"""

import importlib.util
import json
import sqlite3
import types

WILD_TO_CORE = {
    "EnvVar": "Variable",
    "Diagram": "Section",
    "DiagramElement": "Section",
    "Process": "Function",
    "Branch": "File",
    "Type": "Class",
    "Decorator": "Function",
}


def _load(repo_root):
    path = repo_root / "scripts" / "mcp" / "cbm-normalize-watchdog.py"
    assert path.exists(), "watchdog script missing: %s" % path
    spec = importlib.util.spec_from_file_location(
        "cbm_normalize_watchdog", str(path))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _fixture_db(path, project):
    conn = sqlite3.connect(str(path))
    conn.execute(
        "CREATE TABLE nodes (id INTEGER PRIMARY KEY, project TEXT, label TEXT,"
        " name TEXT, qualified_name TEXT, file_path TEXT,"
        " start_line INTEGER, end_line INTEGER, properties TEXT)"
    )
    rows = [(project, wild, "w_%s" % wild) for wild in WILD_TO_CORE]
    rows.append((project, "Function", "anchor_fn"))
    conn.executemany(
        "INSERT INTO nodes (project, label, name) VALUES (?, ?, ?)", rows
    )
    conn.commit()
    conn.close()


def _wild_total(path, project):
    conn = sqlite3.connect("file:%s?mode=ro" % path, uri=True)
    try:
        total = 0
        for wild in WILD_TO_CORE:
            total += conn.execute(
                "SELECT COUNT(*) FROM nodes WHERE label=? AND project=?",
                (wild, project)).fetchone()[0]
        return total
    finally:
        conn.close()


def _watchdog(module, tmp_path, repo_root, projects, **kwargs):
    params = {"daemon_log": str(tmp_path / "daemon.log"),
              "watch_log": str(tmp_path / "watch.log"),
              "cache_dir": str(tmp_path),
              "repo_root": str(repo_root),
              "projects": list(projects)}
    params.update(kwargs)
    return module.Watchdog(**params)


# (a) Zeilen-Parsing ---------------------------------------------------------

def test_parse_indexed_line_extracts_project(repo_root):
    """daemon.index.result mit status=indexed meldet das Projekt."""
    module = _load(repo_root)
    line = ("level=info msg=daemon.index.result "
            "project=home-patrick-Bachelorprojekt path=/home/patrick/x "
            "status=indexed")
    assert module.parse_index_result_line(line) == "home-patrick-Bachelorprojekt"


def test_parse_ignores_foreign_lines(repo_root):
    """Fremde Zeilen und fehlgeschlagene Laeufe ergeben None."""
    module = _load(repo_root)
    assert module.parse_index_result_line(
        "level=info msg=mcp.request protocol=jsonrpc method=tools/list "
        "status=ok duration_ms=0") is None
    assert module.parse_index_result_line(
        "level=error msg=daemon.index.result project=home-patrick path=/x "
        "status=failed") is None
    assert module.parse_index_result_line("") is None
    assert module.parse_index_result_line(
        "level=info msg=daemon.index.result path=/x status=indexed") is None


# (b) Scope-Filterung ----------------------------------------------------------

def test_scope_filtering_only_in_scope_normalizes(repo_root, tmp_path):
    """Nur Scope-Projekte mit status=indexed werden normalisiert."""
    module = _load(repo_root)
    watchdog = _watchdog(module, tmp_path, repo_root,
                         ["home-patrick-Bachelorprojekt"])
    calls = []
    watchdog._normalize_project = lambda project: calls.append(project) or True
    line = ("level=info msg=daemon.index.result project=home-patrick path=/x "
            "status=indexed")
    assert watchdog.handle_line(line) is False
    assert calls == []
    line = ("level=info msg=daemon.index.result "
            "project=home-patrick-Bachelorprojekt path=/x status=indexed")
    assert watchdog.handle_line(line) is True
    assert calls == ["home-patrick-Bachelorprojekt"]
    # CLI-Override der Scope-Liste.
    args = module.parse_args(
        ["--projects", "home-patrick-a,home-patrick-b"])
    assert args.projects == "home-patrick-a,home-patrick-b"


# (c) wait_db_quiescence ---------------------------------------------------------

def _stat_result(mtime_ns, size):
    return types.SimpleNamespace(st_mtime_ns=mtime_ns, st_size=size)


def test_wait_quiescence_quiet(repo_root):
    """Ruhige DB: zwei identische Stats bedeuten True."""
    module = _load(repo_root)
    clock = [10.0]
    sleeps = []
    result = module.wait_db_quiescence(
        "db", interval=1.5, max_wait=30.0,
        stat_fn=lambda _p: _stat_result(123, 456),
        sleep_fn=lambda s: sleeps.append(s),
        clock_fn=lambda: clock[0])
    assert result is True
    assert sleeps == [1.5]


def test_wait_quiescence_missing_db(repo_root):
    """Fehlende DB bedeutet False (kein Crash)."""
    module = _load(repo_root)

    def _missing(_p):
        raise FileNotFoundError("no db")

    assert module.wait_db_quiescence(
        "db", stat_fn=_missing,
        sleep_fn=lambda _s: None, clock_fn=lambda: 0.0) is False


def test_wait_quiescence_never_quiet(repo_root):
    """Staendig wachsende DB bedeutet False nach max_wait."""
    module = _load(repo_root)
    clock = [0.0]
    states = {"n": 0}

    def _growing(_p):
        states["n"] += 1
        return _stat_result(states["n"], 100 + states["n"])

    def _sleep(seconds):
        clock[0] += seconds

    result = module.wait_db_quiescence(
        "db", interval=0.01, max_wait=0.05,
        stat_fn=_growing, sleep_fn=_sleep, clock_fn=lambda: clock[0])
    assert result is False


# (d) --dry-run -------------------------------------------------------------------

def test_dry_run_reports_without_writing(repo_root, tmp_path, capsys):
    """Dry-run meldet Wild-Kinds je Projekt und schreibt nichts."""
    module = _load(repo_root)
    project = "home-patrick-dry"
    db = tmp_path / ("%s.db" % project)
    _fixture_db(db, project)
    before = _wild_total(db, project)
    assert before == len(WILD_TO_CORE)
    watchdog = _watchdog(module, tmp_path, repo_root, [project],
                         dry_run=True, once=True)
    report = watchdog.run()
    captured = capsys.readouterr()
    assert _wild_total(db, project) == before
    payload = json.loads(captured.out)
    assert payload[project]["would_normalize"] is True
    assert payload[project]["wild"]["EnvVar"] == 1


# (e) Apply-Retry --------------------------------------------------------------------

def test_apply_retry_then_success(repo_root, tmp_path):
    """Nach Fehlschlag genau einmal nach 60 s retry, dann normalized."""
    module = _load(repo_root)
    project = "home-patrick-retry"
    db = tmp_path / ("%s.db" % project)
    _fixture_db(db, project)
    calls = []
    sleeps = []

    def _flaky(db_path, proj, root, apply):
        calls.append((db_path, proj, apply))
        if len(calls) == 1:
            return (1, {"error": "boom"})
        return (0, {"mapped": {"EnvVar->Variable": 1}})

    original = module.run_normalizer
    module.run_normalizer = _flaky
    try:
        watchdog = _watchdog(module, tmp_path, repo_root, [project],
                             sleep_fn=lambda s: sleeps.append(s))
        ok = watchdog._normalize_project(project)
    finally:
        module.run_normalizer = original
    assert ok is True
    assert len(calls) == 2
    assert sleeps.count(60.0) == 1, "genau ein Retry nach 60 s: %r" % (sleeps,)
    log_lines = (tmp_path / "watch.log").read_text(encoding="utf-8").strip()
    assert log_lines, "keine normalized-Zeile geloggt"
    entry = json.loads(log_lines.splitlines()[-1])
    assert entry["event"] == "normalized"
    assert entry["project"] == project


def test_apply_double_failure_logs_error(repo_root, tmp_path):
    """Zwei Fehlschlaege ergeben eine error-Zeile und False."""
    module = _load(repo_root)
    project = "home-patrick-fail"
    db = tmp_path / ("%s.db" % project)
    _fixture_db(db, project)
    original = module.run_normalizer
    module.run_normalizer = lambda *a: (1, {"error": "down"})
    try:
        watchdog = _watchdog(module, tmp_path, repo_root, [project],
                             sleep_fn=lambda _s: None)
        assert watchdog._normalize_project(project) is False
    finally:
        module.run_normalizer = original
    entry = json.loads(
        (tmp_path / "watch.log").read_text(encoding="utf-8").strip())
    assert entry["event"] == "error"
    assert entry["project"] == project


# (f) echter Normalizer-Lauf ----------------------------------------------------------

def test_real_normalizer_clears_wild_kinds(repo_root, tmp_path):
    """Echter Subprozess-Lauf: Wild-Kinds vorher >0, danach 0."""
    module = _load(repo_root)
    project = "home-patrick-fixture"
    db = tmp_path / ("%s.db" % project)
    _fixture_db(db, project)
    assert _wild_total(db, project) == len(WILD_TO_CORE)
    original = module.wait_db_quiescence
    module.wait_db_quiescence = lambda *a, **k: True
    try:
        watchdog = _watchdog(module, tmp_path, repo_root, [project],
                             sleep_fn=lambda _s: None)
        assert watchdog._normalize_project(project) is True
    finally:
        module.wait_db_quiescence = original
    assert _wild_total(db, project) == 0
    conn = sqlite3.connect("file:%s?mode=ro" % db, uri=True)
    try:
        labels = [row[0] for row in conn.execute("SELECT label FROM nodes")]
    finally:
        conn.close()
    for wild in WILD_TO_CORE:
        assert wild not in labels
    assert "Variable" in labels


def test_once_skips_clean_projects(repo_root, tmp_path):
    """--once normalisiert nur Projekte mit Wild-Kinds."""
    module = _load(repo_root)
    dirty = "home-patrick-dirty"
    clean = "home-patrick-clean"
    _fixture_db(tmp_path / ("%s.db" % dirty), dirty)
    conn = sqlite3.connect(str(tmp_path / ("%s.db" % clean)))
    conn.execute("CREATE TABLE nodes (id INTEGER PRIMARY KEY, project TEXT,"
                 " label TEXT, name TEXT)")
    conn.execute("INSERT INTO nodes (project, label, name) VALUES (?, ?, ?)",
                 (clean, "Function", "fn"))
    conn.commit()
    conn.close()
    normalized = []
    original = module.run_normalizer

    def _record(db_path, proj, root, apply):
        normalized.append(proj)
        return original(db_path, proj, root, apply)

    module.run_normalizer = _record
    original_wait = module.wait_db_quiescence
    module.wait_db_quiescence = lambda *a, **k: True
    try:
        watchdog = _watchdog(module, tmp_path, repo_root, [dirty, clean],
                             once=True, sleep_fn=lambda _s: None)
        watchdog.run()
    finally:
        module.run_normalizer = original
        module.wait_db_quiescence = original_wait
    assert normalized == [dirty]
    assert _wild_total(tmp_path / ("%s.db" % dirty), dirty) == 0
