"""K1 repo-graph-label-cleanup: post-index normalizer must map wildwuchs
Kind labels (EnvVar/Type/DiagramElement/Process/...) to the core taxonomy.

Pruefmodus: command output verification (T002448-M4) — the test RUNS
scripts/mcp/cbm-normalize-kinds.py via run_cmd and asserts exit code plus
the resulting DB state, never script internals. Live belegged wild labels
(home-patrick-Bachelorprojekt.db, 02.11.2026): EnvVar 1137, Type 485,
DiagramElement 355, Process 57, Diagram 16, Decorator 11.

RED-Phase: the script does not exist yet, so both tests fail. GREEN-Phase:
--apply rewrites wild labels on a fixture DB, dry-run leaves it untouched.
"""

import sqlite3

WILD_TO_CORE = {
    "EnvVar": "Variable",
    "Diagram": "Section",
    "DiagramElement": "Section",
    "Process": "Function",
    "Branch": "File",
    "Type": "Class",
    "Decorator": "Function",
}

CORE_ANCHOR = ("Function", "anchor_fn")


def _fixture_db(path):
    conn = sqlite3.connect(str(path))
    conn.execute(
        "CREATE TABLE nodes (id INTEGER PRIMARY KEY, project TEXT, label TEXT,"
        " name TEXT, qualified_name TEXT, file_path TEXT,"
        " start_line INTEGER, end_line INTEGER, properties TEXT)"
    )
    rows = [(w, "w_%s" % w) for w in WILD_TO_CORE] + [CORE_ANCHOR]
    conn.executemany(
        "INSERT INTO nodes (project, label, name) VALUES ('p', ?, ?)", rows
    )
    conn.commit()
    conn.close()


def _labels(path):
    conn = sqlite3.connect("file:%s?mode=ro" % path, uri=True)
    try:
        return [r[0] for r in conn.execute("SELECT label FROM nodes")]
    finally:
        conn.close()


def test_apply_maps_wild_labels_to_core(repo_root, run_cmd, tmp_path):
    """--apply rewrites every wild label to its core Kind (Semantik:
    exit 0 + DB-Zustand, keine Darstellungs-Assertions)."""
    script = repo_root / "scripts" / "mcp" / "cbm-normalize-kinds.py"
    db = tmp_path / "fixture.db"
    _fixture_db(db)
    result = run_cmd(
        ["python3", str(script), "--db", str(db), "--apply"], timeout=60
    )
    assert result.returncode == 0
    labels = _labels(db)
    for wild in WILD_TO_CORE:
        assert wild not in labels
    # Positiv-Anker (T002356-M1): Kern-Label ueberlebt, gemappte landen dort.
    assert CORE_ANCHOR[0] in labels
    assert labels.count("Variable") == 1
    assert labels.count("Section") == 2
    assert labels.count("Function") == 3  # Anker + Process + Decorator
    assert labels.count("File") == 1
    assert labels.count("Class") == 1


def test_dry_run_changes_nothing(repo_root, run_cmd, tmp_path):
    """Ohne --apply meldet der Normalizer nur und schreibt nichts."""
    script = repo_root / "scripts" / "mcp" / "cbm-normalize-kinds.py"
    db = tmp_path / "fixture.db"
    _fixture_db(db)
    before = _labels(db)
    result = run_cmd(["python3", str(script), "--db", str(db)], timeout=60)
    assert result.returncode == 0
    assert _labels(db) == before
    assert CORE_ANCHOR[0] in before  # Positiv-Anker: Fixture war nicht leer
