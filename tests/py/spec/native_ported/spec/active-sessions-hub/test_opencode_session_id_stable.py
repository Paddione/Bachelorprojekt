"""Native migration of tests/spec/active-sessions-hub/opencode-session-id-stable.bats."""

import os
import re

import pytest


@pytest.fixture
def oc_env(repo_root, tmp_path, monkeypatch):
    """BATS setup(): isolated AGENT_LOCK_DIR."""
    ald = tmp_path / "ald"
    ald.mkdir()
    monkeypatch.setenv("AGENT_LOCK_DIR", str(ald))
    return {"repo": repo_root, "lock": str(repo_root / "scripts" / "agent-lock.sh"),
            "ald": ald, "path": os.environ["PATH"]}


def _identity(o, fn):
    return ["bash", "-c", f"source '{o['repo']}/scripts/agent-lock-identity.sh'; {fn}"]


def test_t002671_my_sid_still_prefers_agent_lock_sid_override_over_any_harness_env_unchanged(run_cmd, oc_env):
    r = run_cmd(["env", "-i", "AGENT_LOCK_SID=test-override", "CLAUDE_CODE_SESSION_ID=claude-1", *_identity(oc_env, "_my_sid")])
    assert r.returncode == 0
    assert r.output == "test-override"


def test_t002671_my_sid_still_returns_claude_code_session_id_when_set_unchanged(run_cmd, oc_env):
    r = run_cmd(["env", "-i", "CLAUDE_CODE_SESSION_ID=claude-session-1", *_identity(oc_env, "_my_sid")])
    assert r.returncode == 0
    assert r.output == "claude-session-1"


def test_t002671_my_sid_returns_the_stable_opencode_session_id_instead_of_the_volatile_per_call_unix_sid(run_cmd, oc_env):
    r = run_cmd(["env", "-i", "OPENCODE_SESSION_ID=oc-session-42", *_identity(oc_env, "_my_sid")])
    assert r.returncode == 0
    assert r.output == "oc-session-42"


def test_t002671_agent_lock_claim_records_the_stable_opencode_session_id_as_owner_sid_not_the_volatile_per_call_unix_sid(run_cmd, oc_env):
    r = run_cmd(["env", "-i", "OPENCODE_SESSION_ID=oc-session-77", f"PATH={oc_env['path']}",
                 f"AGENT_LOCK_DIR={oc_env['ald']}", "bash", oc_env["lock"],
                 "claim", "branch", "fix/opencode-drift-check", "--label", "test"])
    assert r.returncode == 0, f"claim schlug fehl: {r.output}"
    lock_file = oc_env["ald"] / "branch__fix-opencode-drift-check.json"
    assert lock_file.is_file()
    m = re.search(r'"owner_sid": *"([^"]*)"', lock_file.read_text())
    assert m and m.group(1) == "oc-session-77"


def test_t002671_detect_tool_reports_opencode_for_an_opencode_session_id_only_session_instead_of_unknown(run_cmd, oc_env):
    r = run_cmd(["env", "-i", "OPENCODE_SESSION_ID=oc-session-42", *_identity(oc_env, "_detect_tool")])
    assert r.returncode == 0
    assert r.output == "opencode"
