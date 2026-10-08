"""Native migration of tests/spec/active-sessions-hub/agy-session-id-stable.bats."""

import re

import pytest


@pytest.fixture
def agy_env(repo_root, tmp_path, monkeypatch):
    """BATS setup(): isolated lock dir and a fresh git repo with one commit."""
    ald = tmp_path / "ald"
    ald.mkdir()
    monkeypatch.setenv("AGENT_LOCK_DIR", str(ald))
    wt = tmp_path / "fake-repo"
    (wt / "sub").mkdir(parents=True)
    for args in (["init", "-q"], ["config", "user.email", "t@example.com"],
                 ["config", "user.name", "test"], ["commit", "-q", "--allow-empty", "-m", "init"]):
        import subprocess
        subprocess.run(["git", "-C", str(wt), *args], check=True)
    return {
        "repo": repo_root,
        "lock": str(repo_root / "scripts" / "agent-lock.sh"),
        "guard": str(repo_root / "scripts" / "hooks" / "worktree-write-guard.sh"),
        "ald": ald,
        "wt": wt,
        "path": __import__("os").environ["PATH"],
    }


def _field(text, name):
    m = re.search(r'"%s": *"([^"]*)"' % name, text)
    return m.group(1) if m else None


def test_t900306_my_sid_returns_stable_antigravity_conversation_id_instead_of_volatile_unix_sid(run_cmd, agy_env):
    r = run_cmd(["env", "-i", "ANTIGRAVITY_CONVERSATION_ID=agy-session-abc-123", "bash", "-c",
                 f"source '{agy_env['repo']}/scripts/agent-lock-identity.sh'; _my_sid"])
    assert r.returncode == 0
    assert r.output == "agy-session-abc-123"


def test_t900306_agent_lock_claim_records_stable_antigravity_conversation_id_as_owner_sid_and_tool_as_agy(run_cmd, agy_env):
    r = run_cmd(["env", "-i", "ANTIGRAVITY_CONVERSATION_ID=agy-session-xyz-789", f"PATH={agy_env['path']}",
                 f"AGENT_LOCK_DIR={agy_env['ald']}",
                 "bash", agy_env["lock"], "claim", "branch", "fix/agy-drift-check", "--label", "test"])
    assert r.returncode == 0
    lock_file = agy_env["ald"] / "branch__fix-agy-drift-check.json"
    assert lock_file.is_file()
    text = lock_file.read_text()
    assert _field(text, "owner_sid") == "agy-session-xyz-789"
    assert _field(text, "tool") == "agy"


def test_t900306_detect_tool_reports_agy_for_an_antigravity_conversation_id_session(run_cmd, agy_env):
    r = run_cmd(["env", "-i", "ANTIGRAVITY_CONVERSATION_ID=agy-session-42", "bash", "-c",
                 f"source '{agy_env['repo']}/scripts/agent-lock-identity.sh'; _detect_tool"])
    assert r.returncode == 0
    assert r.output == "agy"


def test_t900306_worktree_write_guard_allows_write_when_writer_has_matching_antigravity_conversation_id(run_cmd, agy_env):
    wt = agy_env["wt"]
    (agy_env["ald"] / "branch__test-agy.json").write_text(
        '{\n  "scope": "branch",\n  "id": "test-agy",\n  "owner_sid": "agy-session-99",\n'
        '  "owner_pid": "12345",\n  "tool": "agy",\n  "worktree": "%s"\n}\n' % wt
    )
    cmd = (
        f"printf '{{\"tool_input\":{{\"file_path\":\"%s/sub/file.ts\"}}}}' '{wt}' | "
        f"( cd '{wt}' && env -i PATH='{agy_env['path']}' AGENT_LOCK_DIR='{agy_env['ald']}' "
        f"ANTIGRAVITY_CONVERSATION_ID='agy-session-99' bash '{agy_env['guard']}' )"
    )
    r = run_cmd(["bash", "-c", cmd])
    assert r.returncode == 0
    assert "WARNUNG: worktree-write-guard _my_sid" not in r.output
