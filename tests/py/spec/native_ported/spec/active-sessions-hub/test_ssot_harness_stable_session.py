"""Native migration of tests/spec/active-sessions-hub/ssot-harness-stable-session.bats."""

import pytest

REQ_HEADER = "### Requirement: Harness-Stable Session Identity for agent-lock"


@pytest.fixture
def spec(repo_root):
    path = repo_root / "docs" / "superpowers" / "specs" / "active-sessions-hub.md"
    if not path.is_file():
        pytest.skip("docs/superpowers/specs/active-sessions-hub.md not found")
    return path.read_text(encoding="utf-8")


def test_harness_stable_requirement_exists(spec):
    assert any(line == REQ_HEADER for line in spec.splitlines())


def test_all_7_harness_stable_scenarios_are_present(spec):
    titles = [
        "CLAUDE_CODE_SESSION_ID wins over Unix SID",
        "CLAUDE_SESSION_ID remains accepted",
        "Release succeeds across separate tool calls of the same session",
        "Test override AGENT_LOCK_SID remains authoritative",
        "Harness-owned lock is not reaped by a different harness session",
        "opencode session id resolves to a stable owner_sid instead of the per-call Unix SID",
        "opencode session is reported as tool `opencode`, not `unknown` or `claude`",
    ]
    for title in titles:
        assert f"#### Scenario: {title}" in spec, f"missing scenario: {title}"


def test_harness_stable_requirement_keeps_its_prose_anchors(spec):
    assert any(line == REQ_HEADER for line in spec.splitlines())
    for anchor in ("AGENT_LOCK_SID", "CLAUDE_CODE_SESSION_ID", "OPENCODE_SESSION_ID", "_detect_tool"):
        assert anchor in spec
