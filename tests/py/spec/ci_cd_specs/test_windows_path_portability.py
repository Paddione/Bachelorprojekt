"""Native assertions from tests/spec/ci-cd/windows-path-portability.bats."""

import re


def test_commit_scope_allowlist_nonempty(run_cmd):
    result = run_cmd(["bash", "scripts/validate-commit-msg.sh", "scopes"])
    result.check()
    assert result.output
    assert "website" in result.output
    assert "plans" in result.output


def test_plan_preflight_does_not_duplicate_absolute_paths(run_cmd):
    test_commit_scope_allowlist_nonempty(run_cmd)
    result = run_cmd(["bash", "scripts/plan-preflight.sh", "pre-commit", "--ticket", "T000000"])
    assert "No such file or directory" not in result.output


def test_absolute_path_glob_accepts_windows_drive(repo_root):
    source = (repo_root / "scripts/plan-preflight.sh").read_text()
    assert source
    assert not re.search(r"case[^;]*in\s*/\*\)", source)
