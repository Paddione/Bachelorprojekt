"""Native assertions from tests/spec/ci-cd/fix-ticket-commit-guard.bats."""

import pytest

@pytest.mark.parametrize(("message", "environment", "expected"), [
    ("fix(scripts): irgendein Fix [T004899]", {}, 0),
    ("fix(scripts): irgendein Fix ohne Ticket", {}, 1),
    ("fix(scripts): Notfall ohne Ticket", {"SKIP_FIX_TICKET_GUARD": "1"}, 0),
    ("feat(website): neue Seite", {}, 0),
])
def test_commit_ticket_guard(repo_root, run_cmd, tmp_path, message, environment, expected):
    message_file = tmp_path / "message"
    if expected:
        message_file.write_text("fix(scripts): irgendein Fix [T004899]")
        run_cmd(["bash", str(repo_root / "scripts/check-fix-ticket-guard.sh"), str(message_file)]).check()
    message_file.write_text(message)
    result = run_cmd(["bash", str(repo_root / "scripts/check-fix-ticket-guard.sh"), str(message_file)], env=environment)
    result.check(expected)
