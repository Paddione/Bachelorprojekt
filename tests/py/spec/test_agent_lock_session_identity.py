"""Tests for agent-lock session identity and dev-flow guards (migrated from tests/spec/agent-lock-session-identity.bats)."""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import pytest


@pytest.fixture
def clean_env():
    env = os.environ.copy()
    env.pop("AGENT_LOCK_SID", None)
    env.pop("CLAUDE_CODE_SESSION_ID", None)
    env.pop("CLAUDE_SESSION_ID", None)
    return env


def test_t001268_m1_uses_claude_session_id(repo_root: Path, tmp_path: Path, clean_env):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    script = repo_root / "scripts" / "agent-lock.sh"

    env = clean_env.copy()
    env["AGENT_LOCK_DIR"] = str(lock_dir)
    env["CLAUDE_SESSION_ID"] = "claude-session-fixed-1234"

    res = subprocess.run(["bash", str(script), "claim", "ticket", "T001268-m1", "--label", "mishap1"], env=env)
    assert res.returncode == 0

    lf = lock_dir / "ticket__T001268-m1.json"
    data = json.loads(lf.read_text())
    assert data["owner_sid"] == "claude-session-fixed-1234"


def test_t001268_m1_different_sessions_different_owners(repo_root: Path, tmp_path: Path, clean_env):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    script = repo_root / "scripts" / "agent-lock.sh"

    env_a = clean_env.copy()
    env_a["AGENT_LOCK_DIR"] = str(lock_dir)
    env_a["CLAUDE_SESSION_ID"] = "session-A"
    subprocess.run(["bash", str(script), "claim", "ticket", "T001268-m1b"], env=env_a, check=True)

    env_b = clean_env.copy()
    env_b["AGENT_LOCK_DIR"] = str(lock_dir)
    env_b["CLAUDE_SESSION_ID"] = "session-B"
    res = subprocess.run(["bash", str(script), "claim", "ticket", "T001268-m1b"], env=env_b, capture_output=True, text=True)
    assert res.returncode == 1
    assert "bereits gehalten" in res.stdout or "bereits gehalten" in res.stderr


def test_t001268_m2_dev_flow_plan_precommit_guards(repo_root: Path):
    plan_skill = (repo_root / ".claude" / "skills" / "dev-flow-plan" / "SKILL.md").read_text()
    assert re.search(
        r"do\s+not\s+commit\s+on\s+main|nicht\s+auf\s+main\s+committen|refuse.*main|kein\s+commit\s+auf\s+main|main.*verboten|main.*verweigern",
        plan_skill,
        re.I,
    )
    assert re.search(r"diff\s+--cached\s+--name-only", plan_skill, re.I)
    assert "test-inventory.json" in plan_skill


def test_t001386_feature_path_ticket_claims(repo_root: Path):
    plan_skill = (repo_root / ".claude" / "skills" / "dev-flow-plan" / "SKILL.md").read_text()
    phases_ref = (repo_root / ".claude" / "skills" / "references" / "dev-flow-plan-phases.md").read_text()

    assert "dev-flow-plan-phases" in plan_skill
    assert re.search(r"agent-lock\.sh\s+claim\s+ticket", phases_ref)
    assert re.search(r"agent-lock\.sh\s+claim\s+ticket", plan_skill)


def test_t002375_p1_my_sid_uses_claude_code_session_id(repo_root: Path, tmp_path: Path, clean_env):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    script = repo_root / "scripts" / "agent-lock.sh"

    env = clean_env.copy()
    env["AGENT_LOCK_DIR"] = str(lock_dir)
    env["CLAUDE_CODE_SESSION_ID"] = "harness-real-var-1"

    res = subprocess.run(["bash", str(script), "claim", "ticket", "T002375-p1a", "--label", "probe"], env=env)
    assert res.returncode == 0

    lf = lock_dir / "ticket__T002375-p1a.json"
    data = json.loads(lf.read_text())
    assert data["owner_sid"] == "harness-real-var-1"


def test_t002375_p1_ticket_claim_fills_branch_from_head(repo_root: Path, tmp_path: Path, clean_env):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    tmprepo = tmp_path / "repo"
    tmprepo.mkdir()

    subprocess.run(["git", "-C", str(tmprepo), "init", "-q", "-b", "probe-branch"], check=True)
    subprocess.run(
        ["git", "-C", str(tmprepo), "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"],
        check=True,
    )

    script = repo_root / "scripts" / "agent-lock.sh"
    env = clean_env.copy()
    env["AGENT_LOCK_DIR"] = str(lock_dir)
    env["CLAUDE_CODE_SESSION_ID"] = "branchfill-sid"

    res = subprocess.run(
        ["bash", str(script), "claim", "ticket", "T002375-p1c", "--label", "probe"],
        cwd=tmprepo,
        env=env,
    )
    assert res.returncode == 0

    lf = lock_dir / "ticket__T002375-p1c.json"
    data = json.loads(lf.read_text())
    assert data["branch"] == "probe-branch"


def test_t002375_p1_detached_head_leaves_branch_empty(repo_root: Path, tmp_path: Path, clean_env):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    tmprepo = tmp_path / "repo"
    tmprepo.mkdir()

    subprocess.run(["git", "-C", str(tmprepo), "init", "-q", "-b", "probe-branch"], check=True)
    subprocess.run(
        ["git", "-C", str(tmprepo), "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"],
        check=True,
    )
    subprocess.run(["git", "-C", str(tmprepo), "checkout", "-q", "--detach", "HEAD"], check=True)

    script = repo_root / "scripts" / "agent-lock.sh"
    env = clean_env.copy()
    env["AGENT_LOCK_DIR"] = str(lock_dir)
    env["CLAUDE_CODE_SESSION_ID"] = "detached-sid"

    res = subprocess.run(
        ["bash", str(script), "claim", "ticket", "T002375-p1d", "--label", "probe"],
        cwd=tmprepo,
        env=env,
    )
    assert res.returncode == 0

    lf = lock_dir / "ticket__T002375-p1d.json"
    data = json.loads(lf.read_text())
    assert data["branch"] == ""


def test_t002375_p1_guards_factored_out(repo_root: Path):
    guards_sh = repo_root / "scripts" / "agent-lock-guards.sh"
    assert guards_sh.is_file()
    content = guards_sh.read_text()
    assert "cmd_guard_precommit" in content
    assert "cmd_guard_postcheckout" in content

    lock_sh = (repo_root / "scripts" / "agent-lock.sh").read_text()
    assert "guard-precommit" in lock_sh
    assert not re.search(r"^cmd_guard_precommit\(\)", lock_sh, re.M)


def test_t002373_m2_cmd_release_dead_sid_auto_releases(repo_root: Path, tmp_path: Path, clean_env):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    script = repo_root / "scripts" / "agent-lock.sh"

    env = clean_env.copy()
    env["AGENT_LOCK_DIR"] = str(lock_dir)
    env["AGENT_LOCK_FAKE_ALIVE"] = ""
    env["AGENT_LOCK_SID"] = "ghost-sid-99999"

    subprocess.run(["bash", str(script), "claim", "ticket", "T002373-m2", "--label", "test-release-dead"], env=env, check=True)
    lf = lock_dir / "ticket__T002373-m2.json"
    assert lf.is_file()

    env["AGENT_LOCK_SID"] = "session-B"
    res = subprocess.run(["bash", str(script), "release", "ticket", "T002373-m2"], env=env)
    assert res.returncode == 0
    assert not lf.exists()
