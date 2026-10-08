"""Native assertions from tests/spec/ci-cd/mishap-t002425.bats."""

import re
import pytest


def test_preflight_missing_title_diagnostic(repo_root, run_cmd):
    result = run_cmd(["bash", str(repo_root / "scripts/preflight-pr-scope.sh")])
    assert result.returncode != 0
    assert "PR-Titel fehlt" in result.output.splitlines()[0]
    assert not re.search(r"^[^:]+\.sh: line [0-9]+: 1: ", result.output, re.M)


def test_preflight_valid_title_accepted(repo_root, run_cmd):
    branch = run_cmd(["git", "symbolic-ref", "--short", "HEAD"])
    match = re.search(r"T[0-9]{6}", branch.output, re.I)
    if not match:
        pytest.skip("aktueller Branch traegt keine Ticket-ID (z.B. detached HEAD in CI)")
    result = run_cmd(["bash", str(repo_root / "scripts/preflight-pr-scope.sh"), f"fix(scripts): irgendwas [{match[0]}]"])
    result.check()
    assert "scope 'scripts'" in result.output


def test_baseline_diagnostic_names_stale_branch_remedy(repo_root):
    source = (repo_root / "scripts/code-quality/baseline-key-count-assertion.mjs").read_text()
    assert "baseline-allow" in source
    assert "veralteter Branch" in source
    assert "git checkout origin/main -- docs/code-quality/baseline.json" in source


def test_ci_manual_trigger_available(repo_root):
    source = (repo_root / ".github/workflows/ci.yml").read_text()
    for trigger in ["pull_request", "push", "workflow_dispatch"]:
        assert re.search(r"^  " + trigger + ":", source, re.M)
