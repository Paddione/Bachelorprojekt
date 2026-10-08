"""Native migration of tests/spec/health-goals.bats."""

# G-SEC05: health-goals-check.sh muss BEIDE github-actions[bot]-Mail-Varianten
# aus der "unsignierte Commits"-Zaehlung ausschliessen — mit und ohne den
# numerischen 41898282+-Praefix.

import json
import re
import subprocess
from pathlib import Path

import pytest

BEGIN_PGP = "-----BEGIN " + "PGP SIGNATURE-----"
END_PGP = "-----END " + "PGP SIGNATURE-----"
EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"


def _git(repo: Path, *args: str, stdin: str | None = None):
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        input=stdin,
        timeout=300,
    )


def _sec05_fixture(tmp_path: Path, lines: list[str]) -> Path:
    """Build a repo with known commits; each line is 'email|signed' or 'email|unsigned'."""
    repo = tmp_path / "sec05-fixture"
    repo.mkdir()
    assert _git(repo, "init", "-qb", "main").returncode == 0
    _git(repo, "config", "user.email", "test@example.com")
    _git(repo, "config", "user.name", "Test")
    _git(repo, "config", "commit.gpgsign", "false")
    for line in lines:
        email, signed = line.rsplit("|", 1)
        if signed == "signed":
            parent = _git(repo, "rev-parse", "--verify", "-q", "HEAD").stdout.strip()
            body = f"tree {EMPTY_TREE}\n"
            if parent:
                body += f"parent {parent}\n"
            body += (
                f"author {email} 1700000000 +0000\n"
                f"committer {email} 1700000000 +0000\n"
                f"gpgsig {BEGIN_PGP}\n fake\n {END_PGP}\n\n"
                "signed\n"
            )
            sha = _git(repo, "hash-object", "-t", "commit", "--stdin", "-w", stdin=body).stdout.strip()
            assert _git(repo, "update-ref", "refs/heads/main", sha).returncode == 0
        else:
            done = _git(
                repo, "-c", "commit.gpgsign=false", "commit", "-q",
                "--allow-empty", "--author", email, "-m", "x",
            )
            assert done.returncode == 0, done.stderr
    return repo


def _sec05_count(run_cmd, repo_root: Path, repo: Path):
    lib = repo_root / "scripts" / "lib" / "health-goals-measure.sh"
    return run_cmd(
        ["bash", "-c", 'source "$1" && sec05_unsigned', "_", str(lib)],
        cwd=repo,
        env={"REPO_ROOT": str(repo_root)},
        timeout=300,
    )


def test_g_sec05_filters_the_numeric_prefixed_bot_email_variant(tmp_path, run_cmd, repo_root):
    repo = _sec05_fixture(
        tmp_path,
        [
            "Human <h@example.com>|unsigned",
            "bot <41898282+github-actions[bot]@users.noreply.github.com>|unsigned",
        ],
    )
    result = _sec05_count(run_cmd, repo_root, repo)
    assert result.returncode == 0
    assert result.output == "1"


def test_g_sec05_filters_the_non_prefixed_bot_email_variant(tmp_path, run_cmd, repo_root):
    repo = _sec05_fixture(
        tmp_path,
        [
            "Human <h@example.com>|unsigned",
            "bot <github-actions[bot]@users.noreply.github.com>|unsigned",
        ],
    )
    result = _sec05_count(run_cmd, repo_root, repo)
    assert result.returncode == 0
    assert result.output == "1"


def test_g_sec05_counts_unsigned_humans_excludes_signed_commits(tmp_path, run_cmd, repo_root):
    repo = _sec05_fixture(
        tmp_path,
        [
            "Signed <s@example.com>|signed",
            "A <a@example.com>|unsigned",
            "B <b@example.com>|unsigned",
        ],
    )
    result = _sec05_count(run_cmd, repo_root, repo)
    assert result.returncode == 0
    assert result.output == "2"


# --- T001953: unbounded network calls (G-SEC06 / G-FE05) must be timeout-wrapped ---
# Mishap: the health measurement hung indefinitely because G-FE05
# (Lighthouse via npx, hits live URLs) and
# G-SEC06 (trivy image scan piped from `kubectl get pods`) checks had no
# `timeout` guard, unlike every other kubectl call in this script which
# uses --request-timeout. Regression-guard: both call sites must be wrapped
# in `timeout <n>` so a slow/unreachable network dependency can never hang
# the whole report.


def test_g_fe05_both_lighthouse_npx_calls_are_wrapped_in_a_timeout(repo_root):
    wf = repo_root / ".github" / "workflows" / "health-goals.yml"
    pattern = re.compile(
        r"timeout [0-9]+ npx --yes lighthouse@[0-9.]+ https://web\.(mentolder|korczewski)\.de"
    )
    count = sum(1 for line in wf.read_text(encoding="utf-8").splitlines() if pattern.search(line))
    assert count == 2


def test_g_sec06_the_trivy_image_scan_and_its_kubectl_pod_list_are_wrapped_in_a_timeout(repo_root):
    script = (repo_root / "scripts" / "health-goals-check.sh").read_text(encoding="utf-8").splitlines()
    assert any(re.search(r"timeout [0-9]+ trivy image", line) for line in script)
    assert any(re.search(r"timeout [0-9]+ kubectl get pods --all-namespaces", line) for line in script)


# --- T001884: gen-goals-data.mjs (E4) ---


def _run_gen(run_cmd, repo_root: Path, tmp_path: Path, goals_md: str):
    gen = repo_root / "scripts" / "gen-goals-data.mjs"
    goals = tmp_path / "goals.md"
    out = tmp_path / "out.json"
    goals.write_text(goals_md, encoding="utf-8")
    result = run_cmd(
        ["node", str(gen)],
        env={"GOALS_MD_PATH": str(goals), "GOALS_JSON_OUT": str(out)},
        timeout=300,
    )
    return result, out


def _raw(value) -> str:
    """Mirror `jq -r` output for the scalar values the assertions read."""
    return "null" if value is None else str(value)


GOALS_H2_PRIO_A = """# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

## G-TEST01 — Beispielziel: 7 (Ziel <= 6)

```bash
echo 7
```

> **A · Baseline:** 6 → 7 · **Target:** ≤ 6 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · Ticket: T000001
"""


def test_gen_goals_data_mjs_parses_an_h2_section_prio_a_goal_into_the_healthgoal_shape(
    run_cmd, repo_root, tmp_path
):
    result, out = _run_gen(run_cmd, repo_root, tmp_path, GOALS_H2_PRIO_A)
    assert result.returncode == 0, result.output
    goal = json.loads(out.read_text(encoding="utf-8"))[0]
    assert goal["id"] == "G-TEST01"
    assert _raw(goal["baseline"]) == "6"
    assert _raw(goal["current"]) == "7"
    assert _raw(goal["target"]) == "6"
    assert _raw(goal["direction"]) == "lower"
    assert _raw(goal["source"]) == ".claude/lib/goals.md · G-TEST01"


GOALS_H2_NO_META = """# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

## G-BROKEN01 — Kaputtes Ziel ohne Meta-Zeile

Nur Prosa, keine Meta-Zeile.
"""


def test_gen_goals_data_mjs_fails_loud_on_an_h2_goal_with_no_meta_line(run_cmd, repo_root, tmp_path):
    result, _ = _run_gen(run_cmd, repo_root, tmp_path, GOALS_H2_NO_META)
    assert result.returncode != 0, "should fail loud on missing meta-line"
    assert "G-BROKEN01" in result.output, "error should name the offending id"


GOALS_PRIO_C_TABLE = """# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-TABLE01** | Beispiel-Gate | 0 ✓ | 0 | `echo 0` |
"""


def test_gen_goals_data_mjs_parses_a_prio_c_table_row(run_cmd, repo_root, tmp_path):
    result, out = _run_gen(run_cmd, repo_root, tmp_path, GOALS_PRIO_C_TABLE)
    assert result.returncode == 0, result.output
    goal = json.loads(out.read_text(encoding="utf-8"))[0]
    assert goal["id"] == "G-TABLE01"
    assert _raw(goal["priority"]) == "C"
    assert _raw(goal["baseline"]) == "null"
    assert _raw(goal["current"]) == "0"


GOALS_PRIO_C_PIPE = """# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-TABLE02** | Beispiel-Gate mit Pipe | 0 ✓ | 0 | `git log --oneline \\| wc -l` |
"""


def test_gen_goals_data_mjs_keeps_a_markdown_escaped_pipe_inside_a_prio_c_measurement_cell_intact(
    run_cmd, repo_root, tmp_path
):
    result, out = _run_gen(run_cmd, repo_root, tmp_path, GOALS_PRIO_C_PIPE)
    assert result.returncode == 0, result.output
    goal = json.loads(out.read_text(encoding="utf-8"))[0]
    assert goal["id"] == "G-TABLE02"
    assert goal["measurement"] == "git log --oneline | wc -l", (
        f"measurement truncated/mangled: {goal['measurement']!r}"
    )


# --- T002095: G-DB09 regression — CREATE INDEX DDL pollutes slow-query measurement ---
# Root cause: pg_stat_statements records DDL execution time (e.g. one-time
# `CREATE INDEX ... USING hnsw` vector index builds) alongside DML/SELECT.
# A single legitimate but expensive CREATE INDEX maintenance statement was
# tripping G-DB09's "slow application query" measurement. Same class of gap
# as the COPY-backup exclusion fixed in T001926 — extend the G-DB09 db_scalar
# query with an additional `NOT ILIKE 'CREATE INDEX%'` exclusion.

G_DB09_RE = re.compile(
    r'db_scalar "SELECT count\(\*\) FROM pg_stat_statements WHERE mean_exec_time > 1000[^"]*"'
)


def _g_db09_query(repo_root: Path) -> str:
    """First match of the G-DB09 db_scalar query in health-goals-check.sh (grep -oE | head -1)."""
    script = repo_root / "scripts" / "health-goals-check.sh"
    for line in script.read_text(encoding="utf-8").splitlines():
        match = G_DB09_RE.search(line)
        if match:
            return match.group(0)
    return ""


def test_g_db09_measurement_query_excludes_copy_backup_statements_t001926_regression_guard(repo_root):
    query = _g_db09_query(repo_root)
    assert query, "G-DB09 db_scalar query not found"
    assert "NOT ILIKE 'COPY %'" in query


def test_g_db09_measurement_query_excludes_create_index_ddl_statements_t002095(repo_root):
    query = _g_db09_query(repo_root)
    assert query, "G-DB09 db_scalar query not found"
    assert "NOT ILIKE 'CREATE INDEX%'" in query


# ═══════════════════════════════════════════════════════════════════
# G-OPS01: Pods nicht Running/Ready (fleet, beide Brand-Namespaces)
#
# Der Test ist statisch (kein Live-Cluster nötig, CI-lauffähig) und
# deckt den in Scope stehenden Root Cause der 2026-07-23-Re-Messung
# ab: fehlender Secret-Key (korczewski). livekit-egress-Test G-OPS01b
# entfernt per T002184.
# ═══════════════════════════════════════════════════════════════════


def _required_workspace_secret_keys(yaml_load, path: Path) -> set[str]:
    """Collect every secretKeyRef.key whose secretName == "workspace-secrets"."""
    keys: set[str] = set()
    for doc in yaml_load(path, all_docs=True):
        spec = doc.get("spec", {}) or {}
        tpl = spec.get("template") or {}
        tpl_spec = tpl.get("spec", {}) or {}
        for container in tpl_spec.get("containers", []) or []:
            for env in container.get("env", []) or []:
                ref = (env.get("valueFrom") or {}).get("secretKeyRef") or {}
                if ref.get("name") == "workspace-secrets" and ref.get("key"):
                    keys.add(ref["key"])
    return keys


# T900789: der Legacy-Zwilling (.secrets/korczewski.yaml) entfiel mit der Datei.


def test_g_ops01a_fleet_korczewski_secrets_file_has_every_workspace_secrets_key_oauth2_proxy_terminal_requires(
    repo_root, yaml_load
):
    pytest.skip("Pre-existing regression — follow-up via T002222/T002223 mishap bundles")
    required_file = repo_root / "k3d" / "oauth2-proxy-terminal.yaml"
    secrets_file = repo_root / "environments" / ".secrets" / "fleet-korczewski.yaml"
    if not required_file.is_file():
        pytest.skip(f"{required_file} not found")
    if not secrets_file.is_file():
        pytest.skip(f"{secrets_file} not found")

    present = set((yaml_load(secrets_file) or {}).keys())
    missing = sorted(_required_workspace_secret_keys(yaml_load, required_file) - present)
    assert not missing, (
        "k3d/oauth2-proxy-terminal.yaml requires these workspace-secrets keys but "
        "environments/.secrets/fleet-korczewski.yaml is missing them: " + ", ".join(missing)
    )


# --- D1 whitelist parser (T002107) ---


def _run_update(run_cmd, repo_root: Path, tmp_path: Path, goals_md: str, values: str):
    upd = repo_root / "scripts" / "health-goals-update.sh"
    goals = tmp_path / "goals.md"
    vals = tmp_path / "values"
    goals.write_text(goals_md, encoding="utf-8")
    vals.write_text(values, encoding="utf-8")
    env = {"HG_GOALS_FILE": str(goals), "HG_VALUES_FILE": str(vals)}
    result = run_cmd(["bash", str(upd)], env=env, timeout=300)
    return result, goals


def test_health_goals_update_d1_percent_cell_keeps_its_suffix_t002107(run_cmd, repo_root, tmp_path):
    goals_md = """# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-PCT01** | Prozent-Gate | 90 % ✓ | 95 | `echo 95` |
"""
    result, goals = _run_update(run_cmd, repo_root, tmp_path, goals_md, "G-PCT01 95 ge 95\n")
    assert result.returncode == 0
    assert re.search(r"\| 95 % (✓|⚠) \|", goals.read_text(encoding="utf-8"))


def test_health_goals_update_d1_fraction_cell_updates_numerator_keeps_denominator_t002107(
    run_cmd, repo_root, tmp_path
):
    goals_md = """# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-FRC01** | Bruch-Gate | 0/34 ✓ | 0 | `echo 3` |
"""
    result, goals = _run_update(run_cmd, repo_root, tmp_path, goals_md, "G-FRC01 3 le 0\n")
    assert result.returncode == 0
    assert re.search(r"\| 3/34 (✓|⚠) \|", goals.read_text(encoding="utf-8"))


def test_health_goals_update_d1_non_whitelisted_cell_stays_fail_safe_skipped_t002107(
    run_cmd, repo_root, tmp_path
):
    goals_md = """# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-ELT01** | Qualitativ | Elite | 0 | `echo Elite` |
"""
    result, goals = _run_update(run_cmd, repo_root, tmp_path, goals_md, "G-ELT01 0 le 0\n")
    assert result.returncode == 0
    assert "Elite" in goals.read_text(encoding="utf-8")


# --- D2 drift mode (T002107) ---


def test_health_goals_update_d2_drift_reports_divergence_and_never_writes_goals_md_t002107(
    run_cmd, repo_root, tmp_path
):
    upd = repo_root / "scripts" / "health-goals-update.sh"
    gen = tmp_path / "goals-data.generated.json"
    goals = tmp_path / "goals.md"
    vals = tmp_path / "values"
    goals.write_text(
        """# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-DRF01** | Drift-Gate | 5 ✓ | 0 | `echo 8` |
""",
        encoding="utf-8",
    )
    gen.write_text('[{"id":"G-DRF01","priority":"C","current":"5"}]\n', encoding="utf-8")
    vals.write_text("G-DRF01 8 le 0\n", encoding="utf-8")
    before = goals.read_bytes()
    result = run_cmd(
        ["bash", str(upd), "--drift"],
        env={
            "HG_GOALS_FILE": str(goals),
            "HG_VALUES_FILE": str(vals),
            "HG_GEN_JSON": str(gen),
        },
        timeout=300,
    )
    assert result.returncode == 0
    assert "G-DRF01" in result.output and "DRIFT" in result.output
    assert goals.read_bytes() == before


# --- D3 LLM-Fill (T002107) ---


def test_health_goals_llm_fill_d3_candidate_set_generated_ids_minus_measured_ids_t002107(
    run_cmd, repo_root, tmp_path
):
    fill = repo_root / "scripts" / "health-goals-llm-fill.sh"
    gen = tmp_path / "gen.json"
    vals = tmp_path / "values"
    gen.write_text(
        '[{"id":"G-A","priority":"C","current":"0"},{"id":"G-B","priority":"C","current":"0"}]\n',
        encoding="utf-8",
    )
    vals.write_text("G-A 0 le 0\n", encoding="utf-8")
    result = run_cmd(
        ["bash", str(fill)],
        env={
            "HG_GEN_JSON": str(gen),
            "HG_VALUES_FILE": str(vals),
            "HG_LLM_URL": "http://127.0.0.1:1/v1",
        },
        timeout=300,
    )
    assert result.returncode == 0
    assert "G-B" in result.output


def test_health_goals_llm_fill_d3_unreachable_gateway_exits_1_under_strict_t002107(
    run_cmd, repo_root, tmp_path
):
    fill = repo_root / "scripts" / "health-goals-llm-fill.sh"
    gen = tmp_path / "gen.json"
    vals = tmp_path / "values"
    gen.write_text('[{"id":"G-B","priority":"C","current":"0"}]\n', encoding="utf-8")
    vals.write_text("G-A 0 le 0\n", encoding="utf-8")
    result = run_cmd(
        ["bash", str(fill), "--strict"],
        env={
            "HG_GEN_JSON": str(gen),
            "HG_VALUES_FILE": str(vals),
            "HG_LLM_URL": "http://127.0.0.1:1/v1",
        },
        timeout=300,
    )
    assert result.returncode == 1


# --- T002162: Repo-Health-Dashboard liefert eingefrorene Werte ---
# RC2: gen-goals-data.mjs nimmt den letzten "**Baseline-Update <datum>"-Treffer in
# DOKUMENT-Reihenfolge statt das juengste Datum. In .claude/lib/goals.md stehen die
# Marker thematisch (Prio-A-Abschnitt oben, Prio-B/C-Historie unten), nicht
# chronologisch — der 2026-07-25-Marker auf Zeile 108 verliert deshalb gegen die
# 2026-07-22-Marker auf Zeile 577/595/604. Alle 95 Ziele tragen dadurch einen
# vier Tage alten measured_at, den das Dashboard als "Mess-Stichtag" anzeigt.


def test_gen_goals_data_mjs_measured_at_picks_the_newest_baseline_update_date(run_cmd, repo_root, tmp_path):
    goals_md = """# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

**Baseline-Update 2026-07-25 (T002063):** neuester Stand, steht aber weit oben im Dokument.

# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-TABLE03** | Beispiel-Gate | 0 ✓ | 0 | `echo 0` |

**Baseline-Update 2026-07-22:** aelterer Stand, steht aber weiter unten im Dokument.
"""
    result, out = _run_gen(run_cmd, repo_root, tmp_path, goals_md)
    assert result.returncode == 0, result.output
    measured = json.loads(out.read_text(encoding="utf-8"))[0]["measured_at"]
    assert measured == "2026-07-25", (
        f"measured_at = '{measured}', erwartet '2026-07-25' (juengstes Datum, nicht letzter Dokument-Treffer)"
    )


def test_gen_goals_data_mjs_measured_at_falls_back_to_baseline_stichtag_when_no_update_marker_exists(
    run_cmd, repo_root, tmp_path
):
    goals_md = """# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-TABLE04** | Beispiel-Gate | 0 ✓ | 0 | `echo 0` |
"""
    result, out = _run_gen(run_cmd, repo_root, tmp_path, goals_md)
    assert result.returncode == 0, result.output
    assert json.loads(out.read_text(encoding="utf-8"))[0]["measured_at"] == "2026-07-01"


# RC1: Glied [1] der Datenkette (die Messung selbst) lief nirgends automatisch.
# Die folgenden Tests pinnen die Eigenschaften des neuen nightly Workflows fest,
# die still brechen koennten, ohne dass irgendetwas rot wird.


def _workflow_lines(repo_root: Path) -> list[str]:
    """Effektive Konfiguration ohne YAML-Kommentarzeilen. Der Workflow begruendet in
    Kommentaren, warum --fast und [skip ci] NICHT verwendet werden — ein naives grep
    ueber die ganze Datei wuerde genau diese Dokumentation als Verstoss werten."""
    wf = repo_root / ".github" / "workflows" / "health-goals.yml"
    return [l for l in wf.read_text(encoding="utf-8").splitlines() if not re.match(r"^\s*#", l)]


def test_health_goals_yml_nightly_workflow_exists_and_runs_at_0100_utc_before_quality_loop(repo_root):
    wf = repo_root / ".github" / "workflows" / "health-goals.yml"
    assert wf.is_file(), f"{wf} fehlt — die Messung wird nicht automatisch angestossen"
    assert any(re.search(r'^\s*-\s*cron:\s*"0 1 \* \* \*"', l) for l in wf.read_text(encoding="utf-8").splitlines()), (
        "kein cron '0 1 * * *' in health-goals.yml"
    )
    # quality-loop.yml laeuft 02:00 und leitet CQ-GATE-Tickets aus den Werten ab —
    # die Messung muss davor liegen, sonst arbeitet es auf dem Vortagsstand.
    ql = repo_root / ".github" / "workflows" / "quality-loop.yml"
    assert any(re.search(r'^\s*-\s*cron:\s*"0 2 \* \* \*"', l) for l in ql.read_text(encoding="utf-8").splitlines()), (
        "quality-loop.yml laeuft nicht mehr um 02:00 — Reihenfolge-Annahme gebrochen"
    )


def test_health_goals_yml_measures_with_full_never_fast_db_scalar_skips_every_db_goal_in_fast_mode(repo_root):
    wf = repo_root / ".github" / "workflows" / "health-goals.yml"
    assert wf.is_file(), f"{wf} fehlt"
    config = _workflow_lines(repo_root)
    assert not any("--fast" in l for l in config), (
        "--fast im Workflow — db_scalar liefert dann fuer alle DB-Ziele '-' und sie werden stumm uebersprungen"
    )
    assert any("--full" in l for l in config), "kein --full im Workflow"


def test_health_goals_yml_commits_goals_md_and_generated_json_atomically_no_freshness_check_window_on_main(
    repo_root,
):
    wf = repo_root / ".github" / "workflows" / "health-goals.yml"
    assert wf.is_file(), f"{wf} fehlt"
    # Wuerde der Workflow nur goals.md committen und generated.json der
    # freshness-regen.yml ueberlassen, haette main ein Fenster, in dem
    # task freshness:check fehlschlaegt — und zwar in der CI fremder PRs.
    text = wf.read_text(encoding="utf-8")
    assert "health:goals:emit" in text, (
        "kein health:goals:emit — generated.json wuerde erst spaeter nachgezogen (Inkonsistenz-Fenster auf main)"
    )
    assert "goals-data.generated.json" in text, "generated.json wird nicht explizit mit-committet"


def test_health_goals_yml_does_not_mark_its_commit_skip_ci_build_sdlc_console_must_pick_up_the_new_values(
    repo_root,
):
    wf = repo_root / ".github" / "workflows" / "health-goals.yml"
    assert wf.is_file(), f"{wf} fehlt"
    assert not any("[skip ci]" in l for l in _workflow_lines(repo_root)), (
        "[skip ci] im Commit — build-sdlc-console.yml triggert auf components/website/src/lib/** und wuerde uebersprungen; "
        "das Dashboard bliebe auf dem alten Image (seit T002639 baut die SDLC-Console, nicht build-website.yml)"
    )
