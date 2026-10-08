"""Native migration of tests/spec/dev-flow-plan/task-context.bats."""
# T002420: task-context channel. Generator (plan-intel.sh), assembler (task-context.sh), gate
# (plan-lint I1). Command output verification [T002448-M4].
# Per test a fixture change dir tcc-fixture-<pid> is materialised under .agents/plans/ (where the
# scripts look for it) and removed afterwards. Orphans older than 10 minutes are reaped first,

# as in the BATS setup().

import json
import os
import re
import shutil
import time

import pytest

# Writes fixed paths under the shared repo; serialize across xdist workers.
pytestmark = pytest.mark.repo_lock("agents-plans")


def _jq_r(value) -> str:
    """Approximate `jq -r` output for one value (missing value -> empty string)."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(value)


def _impact(data, path):
    for entry in data.get("impact_files", []):
        if entry.get("path") == path:
            return entry
    return None


@pytest.fixture
def tcc(repo_root):
    """BATS setup()/teardown() equivalent: reap orphans, materialise the fixture, clean up."""
    plans = repo_root / ".agents" / "plans"
    now = time.time()
    # Reap orphaned tcc-fixture-<digits> dirs older than 10 minutes (find -mmin +10).
    if plans.is_dir():
        for orphan in plans.iterdir():
            if (orphan.is_dir() and re.fullmatch(r"tcc-fixture-.*[0-9]", orphan.name)
                    and now - orphan.stat().st_mtime > 600):
                shutil.rmtree(orphan, ignore_errors=True)

    slug = f"tcc-fixture-{os.getpid()}"
    change_dir = plans / slug
    fixture_src = repo_root / "tests" / "fixtures" / "task-context-channel"
    shutil.rmtree(change_dir, ignore_errors=True)
    change_dir.mkdir(parents=True)
    shutil.copytree(fixture_src, change_dir, dirs_exist_ok=True)
    # copytree copies the source dir mtime; a stale mtime would let a parallel reaper delete it.
    os.utime(change_dir, None)
    try:
        yield {"slug": slug, "dir": change_dir, "repo": repo_root}
    finally:
        # Only remove a path that really is our fixture.
        if "/.agents/plans/tcc-fixture-" in str(change_dir):
            shutil.rmtree(change_dir, ignore_errors=True)


@pytest.fixture
def run(run_cmd, repo_root):
    def _run(*args, cwd=None):
        return run_cmd(["bash", *[str(a) for a in args]], cwd=cwd or repo_root)

    return _run


# -- Generator (p1) -------------------------------------------------------------

def test_tcc_gen_erzeugt_schema_konformes_bundle_aus_fixture_slug(tcc, run, tmp_path):
    out = tmp_path / "intel.json"
    res = run(tcc["repo"] / "scripts" / "plan-intel.sh", tcc["slug"], "--out", out)
    assert res.returncode == 0, f"Generator failed: {res.output}"
    data = json.loads(out.read_text(encoding="utf-8"))
    for key in ("meta", "impact_files", "symbols"):
        assert key in data, f"MISSING top-level key: {key}"
    assert all("loc" in e and "s1_budget" in e for e in data.get("impact_files", []))


def test_tcc_gen_s1_ignore_datei_erhaelt_s1_budget_null_gemessene_datei_numerisch(tcc, run, tmp_path):
    out = tmp_path / "intel.json"
    res = run(tcc["repo"] / "scripts" / "plan-intel.sh", tcc["slug"], "--out", out)
    assert res.returncode == 0
    data = json.loads(out.read_text(encoding="utf-8"))

    lint_entry = _impact(data, "scripts/plan-lint.sh")
    lint_budget = _jq_r(lint_entry.get("s1_budget") if lint_entry else None) if lint_entry else ""
    assert re.fullmatch(r"-?[0-9]+", lint_budget), (
        f"gemessene Datei hat nicht-numerischen budget: {lint_budget}"
    )
    pipe_entry = _impact(data, "scripts/orchestrator/pipeline.mjs")
    pipeline_budget = _jq_r(pipe_entry.get("s1_budget") if pipe_entry else None) if pipe_entry else ""
    assert pipeline_budget == "null", (
        f"s1.ignore Datei hat budget: {pipeline_budget} (sollte null sein)"
    )


def test_tcc_gen_nicht_erreichbare_quelle_erzeugt_risks_mit_severity_warn(tcc, run, tmp_path):
    out = tmp_path / "intel.json"
    res = run(tcc["repo"] / "scripts" / "plan-intel.sh", tcc["slug"], "--out", out)
    assert res.returncode == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    warn_count = sum(1 for r in data.get("risks", []) if r.get("severity") == "warn")
    assert warn_count >= 1, "kein warn-risk gefunden"


def test_tcc_gen_vorhandene_api_contracts_ueberleben_erneuten_lauf(tcc, run, tmp_path):
    intel = tcc["dir"] / "intel.json"
    saved_contract = [{"route": "/test", "method": "GET", "request_type": "void",
                       "response_type": "string", "file": "test.js"}]
    backup = tmp_path / "backup.json"
    shutil.copyfile(intel, backup)
    data = json.loads(intel.read_text(encoding="utf-8"))
    data["api_contracts"] = saved_contract
    intel.write_text(json.dumps(data), encoding="utf-8")

    res = run(tcc["repo"] / "scripts" / "plan-intel.sh", tcc["slug"])
    assert res.returncode == 0

    contracts = json.loads(intel.read_text(encoding="utf-8")).get("api_contracts") or []
    first = contracts[0] if contracts and isinstance(contracts[0], dict) else {}
    ac_route = first.get("route") or "empty"
    # Restore backup
    shutil.copyfile(backup, intel)
    assert ac_route == "/test", f"api_contracts wurden ueberschrieben: {ac_route}"


# -- Assembler (p2) -------------------------------------------------------------

def test_tcc_asm_fehlendes_intel_json_exit_ungleich_0_keine_kontext_ausgabe_auf_stdout(tcc, run):
    res = run(tcc["repo"] / "scripts" / "task-context.sh", "nonexistent-slug")
    assert res.returncode != 0, "Assembler endete mit 0 trotz fehlendem intel.json"
    assert "## Intel" not in res.output, "stdout enthaelt Kontextblock (## Intel) trotz Fehler"


def test_tcc_asm_nicht_erreichbares_signal_exit_0_warn_marker_positiv_anker(tcc, run):
    res = run(tcc["repo"] / "scripts" / "task-context.sh", tcc["slug"])
    assert res.returncode == 0, f"Assembler endete != 0: {res.output}"
    assert "## Intel" in res.output, "kein Kontextblock (## Intel) in Ausgabe"


def test_tcc_asm_partial_p3_liefert_genau_dessen_impact_files(tcc, run):
    res = run(tcc["repo"] / "scripts" / "task-context.sh", tcc["slug"], "--partial", "p3")
    assert res.returncode == 0
    assert "p3" in res.output, "Partial-Name p3 fehlt im Header"


# -- Gate (p3) ------------------------------------------------------------------

def test_tcc_gate_vollstaendiges_bundle_passiert_plan_lint(tcc, run):
    res = run(tcc["repo"] / "scripts" / "plan-intel.sh", tcc["slug"])
    assert res.returncode == 0
    res = run(tcc["repo"] / "scripts" / "plan-lint.sh", tcc["repo"] / ".agents" / "plans" / tcc["slug"] / "tasks.md")
    assert res.returncode == 0, f"lint failed on complete bundle: {res.output}"


def test_tcc_gate_fehlende_zieldatei_in_impact_files_hard_fail_mit_dateinamen(tcc, run):
    intel = tcc["dir"] / "intel.json"
    res = run(tcc["repo"] / "scripts" / "plan-intel.sh", tcc["slug"])
    assert res.returncode == 0
    backup = intel.read_bytes()
    data = json.loads(intel.read_text(encoding="utf-8"))
    data["impact_files"] = [e for e in data.get("impact_files", []) if e.get("path") != "scripts/plan-intel.sh"]
    intel.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    try:
        res = run(tcc["repo"] / "scripts" / "plan-lint.sh", tcc["repo"] / ".agents" / "plans" / tcc["slug"] / "tasks.md")
    finally:
        intel.write_bytes(backup)
    assert res.returncode != 0, "lint sollte fehlschlagen bei unvollstaendigem Bundle"
    assert "plan-intel.sh" in res.output, f"Meldung nennt fehlende Datei nicht: {res.output}"


def test_tcc_gate_plan_ohne_tasks_d_wird_von_i1_nicht_beruehrt(tcc, run, tmp_path):
    single_plan = tmp_path / "tasks.md"
    single_plan.write_text(
        '---\ntitle: "single — Implementation Plan"\nticket_id: T900725\ndomains: [test]\n'
        "status: completed\nfile_locks: []\nshared_changes: false\nbatch_id: null\n"
        "parent_feature: null\ndepends_on_plans: []\n---\n\n"
        "# single — Implementation Plan\n\n_Ticket: T900725_\n\n"
        "## File Structure\n\n- `scripts/plan-intel.sh`\n\n"
        "## Tasks\n\n"
        "- [x] Failing test step: `bats tests/spec/os-retirement-code.bats`; expected: FAIL before implementation.\n"
        "- [x] Keep `scripts/plan-intel.sh` working.\n"
        "- [x] Final verification: `task test:changed`, `task freshness:regenerate`, `task freshness:check`.\n",
        encoding="utf-8",
    )
    res = run(tcc["repo"] / "scripts" / "plan-lint.sh", single_plan)
    assert res.returncode == 0, f"lint failed auf Plan ohne tasks.d/: {res.output}"


# -- Konsistenz -----------------------------------------------------------------

def test_tcc_consistency_gleicher_slug_liefert_gleichen_statischen_kern(tcc, run):
    res1 = run(tcc["repo"] / "scripts" / "task-context.sh", tcc["slug"])
    assert res1.returncode == 0, f"erster Aufruf fehlgeschlagen: {res1.output}"
    res2 = run(tcc["repo"] / "scripts" / "task-context.sh", tcc["slug"])
    assert res2.returncode == 0, f"zweiter Aufruf fehlgeschlagen: {res2.output}"
    assert res1.output == res2.output, "statischer Kern unterscheidet sich zwischen Aufrufen"
