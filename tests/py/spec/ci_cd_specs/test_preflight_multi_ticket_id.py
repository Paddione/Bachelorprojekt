"""Native assertions from tests/spec/ci-cd/preflight-multi-ticket-id.bats."""

import pytest

@pytest.fixture
def sandbox(tmp_path, run_cmd):
    run_cmd(["git", "init", "-q", "-b", "work-t003103", str(tmp_path)]).check()
    for key, value in [("user.email", "test@example.invalid"), ("user.name", "Test Fixture")]:
        run_cmd(["git", "config", key, value], cwd=tmp_path).check()
    run_cmd(["git", "-c", "core.hooksPath=/dev/null", "commit", "-q", "--allow-empty", "-m", "fixture"], cwd=tmp_path).check()
    return tmp_path

@pytest.mark.parametrize(("title", "accepted", "ids"), [
    ("fix(ops): einzelnes Ticket [T003103]", True, []),
    ("fix(ops): fremdes Ticket [T003180]", False, []),
    ("fix(ops): loest T003180 mit [T003103]", True, []),
    ("fix(ops): [T003103] loest nebenbei T003180", True, []),
    ("fix(ops): loest T003180 und [T003074]", False, ["T003180", "T003074"]),
])
def test_all_pr_title_ticket_ids_checked(repo_root, run_cmd, sandbox, title, accepted, ids):
    command = ["bash", str(repo_root / "scripts/preflight-pr-scope.sh")]
    if not accepted:
        run_cmd(command + ["fix(ops): einzelnes Ticket [T003103]"], cwd=sandbox).check()
    result = run_cmd(command + [title], cwd=sandbox)
    if accepted:
        result.check()
    else:
        assert result.returncode != 0
        line = "\n".join(line for line in result.output.splitlines() if "does not match current branch" in line)
        assert line
        for ticket in ids:
            assert ticket in line
