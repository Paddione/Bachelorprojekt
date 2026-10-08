"""Native migration of tests/spec/repo-hygiene/precheck-foreign-session.bats."""

import re
from pathlib import Path

import pytest

PROBE_BRANCH = "t900016-precheck-probe"


@pytest.fixture
def ctx(repo_root: Path, run_cmd):
    script = repo_root / "scripts" / "repo-hygiene-precheck.sh"
    if not script.is_file():
        pytest.skip("repo-hygiene-precheck.sh fehlt")
    yield {"repo": repo_root, "script": script, "run": run_cmd}
    # Probe branch cleanup, also after a failing test.
    run_cmd(["git", "-C", str(repo_root), "branch", "-D", PROBE_BRANCH])


def _precheck(c, *args):
    return c["run"](["bash", str(c["script"]), *args])


def test_t900016_snapshot_yields_a_stable_fingerprint(ctx):
    res = _precheck(ctx, "--snapshot")
    assert res.returncode == 0, res.output
    first = res.output
    assert re.fullmatch(r"[0-9a-f]{64}", first), f"not a sha256 fingerprint: {first!r}"

    res2 = _precheck(ctx, "--snapshot")
    assert res2.returncode == 0
    assert res2.output == first, "fingerprint changed without mutation"


def test_t900016_verify_reports_an_unchanged_state_as_stable(ctx):
    fp = _precheck(ctx, "--snapshot").stdout.strip()
    res = _precheck(ctx, "--verify", fp)
    assert res.returncode == 0, res.output
    assert "stabil" in res.output


def test_t900016_verify_detects_foreign_mutation_on_branch_inventory(ctx):
    fp = _precheck(ctx, "--snapshot").stdout.strip()

    # Positiv-Anker zuerst: vor der Mutation ist der Zustand stabil.
    assert _precheck(ctx, "--verify", fp).returncode == 0

    # Fremdsession aendert Refs ohne Tick-Lock.
    ctx["run"](["git", "-C", str(ctx["repo"]), "branch", PROBE_BRANCH, "HEAD"]).check(0)

    res = _precheck(ctx, "--verify", fp)
    assert res.returncode == 1, res.output
    assert "DRIFT" in res.output

    ctx["run"](["git", "-C", str(ctx["repo"]), "branch", "-D", PROBE_BRANCH]).check(0)
    assert _precheck(ctx, "--verify", fp).returncode == 0


def test_t900016_verify_without_fingerprint_is_precondition_2_not_finding_1(ctx):
    res = _precheck(ctx, "--verify")
    assert res.returncode == 2, res.output


def test_t900016_unknown_option_is_precondition_2_not_finding_1(ctx):
    res = _precheck(ctx, "--gibtsnicht")
    assert res.returncode == 2, res.output
    assert "Usage:" in res.output


def test_t900016_precheck_checks_main_checkout_claim_not_only_hygiene_tick(ctx):
    res = _precheck(ctx, "--check")
    # rc 0, 1 und 2 sind gueltige Ergebnisse; der Lauf darf nicht im Argument-Parsing abbrechen.
    assert "Usage:" not in res.output
    assert "Hygiene-Tick" in res.output
    assert "main-checkout" in res.output


def test_t900016_runbook_invokes_precheck_instead_of_only_describing_it(ctx):
    runbook = ctx["repo"] / ".claude" / "skills" / "references" / "repo-hygiene-ops.md"
    assert runbook.is_file()
    text = runbook.read_text(encoding="utf-8")
    assert "scripts/repo-hygiene-precheck.sh" in text
    assert "agent-lock.sh claim main-checkout" in text
