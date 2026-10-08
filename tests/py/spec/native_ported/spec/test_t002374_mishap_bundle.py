"""Native migration of tests/spec/t002374-mishap-bundle.bats."""

from pathlib import Path

import pytest


@pytest.fixture
def root(repo_root: Path) -> Path:
    return repo_root


LOCK_JSON_TEMPLATE = """{{
  "scope": "ticket",
  "id": "{id}",
  "owner_sid": "{sid}",
  "owner_pid": "{pid}",
  "tool": "claude",
  "label": "test-claim",
  "worktree": "",
  "branch": "chore/test",
  "ticket": "",
  "host": "test",
  "created_at": "1000000000",
  "heartbeat_at": "1000000000"
}}
"""


def test_t002374_skills_is_a_valid_commit_scope_validate_commit_msg(run_cmd, root, tmp_path):
    msg = tmp_path / "commit-msg"
    msg.write_text("chore(skills): Skill-Scope aufraeumen\n", encoding="utf-8")
    res = run_cmd(["bash", str(root / "scripts" / "validate-commit-msg.sh"), "message", str(msg)])
    assert res.returncode == 0, res.output
    assert "OK" in res.output


def test_t002374_skills_is_in_named_scopes_of_commitlint_config(root):
    assert "'skills'" in (root / "commitlint.config.cjs").read_text(encoding="utf-8")


def test_t002374_agent_lock_release_without_force_fails_on_sid_mismatch_despite_same_tool_class(run_cmd, root, tmp_path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    lf = lock_dir / "ticket__T002374_TEST.json"
    lf.write_text(LOCK_JSON_TEMPLATE.format(id="T002374_TEST", sid="999999999", pid="999999"), encoding="utf-8")

    res = run_cmd(
        ["bash", str(root / "scripts" / "agent-lock.sh"), "release", "ticket", "T002374_TEST"],
        env={
            "AGENT_LOCK_DIR": str(lock_dir),
            "AGENT_LOCK_FAKE_ALIVE": "999999999",
            "AGENT_LOCK_TOOL": "claude",
            "AGENT_LOCK_SID": "888888888",
        },
    )
    assert res.returncode == 1, res.output
    assert "--force" in res.output
    assert lf.is_file()


def test_t002374_agent_lock_release_without_force_fails_on_tool_mismatch(run_cmd, root, tmp_path):
    lock_dir = tmp_path / "locks2"
    lock_dir.mkdir()
    lf = lock_dir / "ticket__T002374_TEST2.json"
    lf.write_text(LOCK_JSON_TEMPLATE.format(id="T002374_TEST2", sid="999999998", pid="999998"), encoding="utf-8")

    res = run_cmd(
        ["bash", str(root / "scripts" / "agent-lock.sh"), "release", "ticket", "T002374_TEST2"],
        env={
            "AGENT_LOCK_DIR": str(lock_dir),
            "AGENT_LOCK_FAKE_ALIVE": "999999998",
            "AGENT_LOCK_TOOL": "gemini",
            "AGENT_LOCK_SID": "777777777",
        },
    )
    assert res.returncode == 1, res.output
    assert "--force" in res.output
