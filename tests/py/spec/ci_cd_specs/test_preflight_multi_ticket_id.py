"""Ticket IDs in PR titles no longer gate (retirement 2026-10-14).

Native assertions ported from tests/spec/ci-cd/preflight-multi-ticket-id.bats.
The title<->branch ticket matching was removed with the ticket system:
titles carrying ticket IDs are accepted when their scope is valid.
"""

import pytest


@pytest.fixture
def sandbox(tmp_path, run_cmd):
    run_cmd(["git", "init", "-q", "-b", "work-t003103", str(tmp_path)]).check()
    for key, value in [("user.email", "test@example.invalid"), ("user.name", "Test Fixture")]:
        run_cmd(["git", "config", key, value], cwd=tmp_path).check()
    run_cmd(["git", "-c", "core.hooksPath=/dev/null", "commit", "-q", "--allow-empty", "-m", "fixture"], cwd=tmp_path).check()
    return tmp_path


@pytest.mark.parametrize("title", [
    "fix(ops): einzelnes Ticket [T003103]",
    "fix(ops): fremdes Ticket [T003180]",
    "fix(ops): loest T003180 mit [T003103]",
    "fix(ops): [T003103] loest nebenbei T003180",
    "fix(ops): loest T003180 und [T003074]",
])
def test_all_pr_title_ticket_ids_ignored(repo_root, run_cmd, sandbox, title):
    command = ["bash", str(repo_root / "scripts/preflight-pr-scope.sh")]
    result = run_cmd(command + [title], cwd=sandbox)
    result.check()
