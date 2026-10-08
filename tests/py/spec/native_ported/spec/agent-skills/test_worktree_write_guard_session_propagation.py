"""Native migration of tests/spec/agent-skills/worktree-write-guard-session-propagation.bats."""

import os
import re
import subprocess

import pytest


@pytest.fixture
def ctx(run_cmd, repo_root, tmp_path):
    """BATS setup: Sandbox-Repo, fremder Orchestrator-Claim auf wt-other."""
    bt = tmp_path / "bt"
    bt.mkdir()
    repo = bt / "repo"
    (repo / "wt-other").mkdir(parents=True)
    (repo / "wt-other/README.md").write_text("", encoding="utf-8")

    run_cmd(["git", "init", "-b", "main"], cwd=repo).check()
    run_cmd(["git", "config", "user.email", "test@example.com"], cwd=repo).check()
    run_cmd(["git", "config", "user.name", "Test User"], cwd=repo).check()
    (repo / "README.md").write_text("", encoding="utf-8")
    run_cmd(["git", "add", "README.md"], cwd=repo).check()
    run_cmd(["git", "commit", "-m", "chore: init"], cwd=repo).check()

    locks = bt / "locks"
    locks.mkdir()
    (locks / "branch__fix-demo-T001111.json").write_text(
        '{"owner_sid":"orchestrator-sid","owner_pid":"1234","worktree":"%s/wt-other",'
        '"branch":"fix/demo-T001111","label":"live"}\n' % repo,
        encoding="utf-8",
    )
    return {"repo": repo, "locks": locks, "guard": repo_root / "scripts/hooks/worktree-write-guard.sh",
            "root": repo_root}


def _guard(c, target, agent_lock_sid=None):
    env = os.environ.copy()
    env["AGENT_LOCK_DIR"] = str(c["locks"])
    if agent_lock_sid is not None:
        env["AGENT_LOCK_SID"] = agent_lock_sid
    payload = '{"tool_input":{"file_path":"%s"}}' % target
    return subprocess.run(
        ["bash", str(c["guard"])],
        input=payload + "\n",
        text=True,
        capture_output=True,
        cwd=str(c["repo"]),
        env=env,
        timeout=120,
    )


def _text(*paths):
    return "\n".join(p.read_text(encoding="utf-8") for p in paths if p.is_file())


def test_t1_regel_3_ablehnung_nennt_den_agent_lock_sid_propagations_hinweis(ctx):
    r = _guard(ctx, str(ctx["repo"] / "wt-other/README.md"), agent_lock_sid="implementer-sid")
    assert r.returncode == 2
    assert re.search("AGENT_LOCK_SID", r.stdout + r.stderr, re.I)


def test_t2_dev_flow_execute_skill_md_propagiert_die_parent_sid_an_den_implementer(ctx):
    skill = ctx["root"] / ".claude/skills/dev-flow-execute/SKILL.md"
    handoff = ctx["root"] / ".claude/skills/dev-flow-execute/references/implementer-handoff.md"
    assert skill.is_file()
    text = _text(skill, handoff)
    assert re.search("agent-lock.sh mine", text, re.I)
    assert re.search("AGENT_LOCK_SID", text, re.I)


def test_t3_worktree_write_mit_agent_lock_sid_owner_sid_des_claims_wird_erlaubt(ctx):
    r = _guard(ctx, str(ctx["repo"] / "wt-other/README.md"), agent_lock_sid="orchestrator-sid")
    assert r.returncode == 0


def test_t4_dev_flow_plan_skill_md_propagiert_die_parent_sid_an_plan_subagenten(ctx):
    skill = ctx["root"] / ".claude/skills/dev-flow-plan/SKILL.md"
    assert skill.is_file()
    text = skill.read_text(encoding="utf-8")
    assert re.search("agent-lock.sh mine", text, re.I)
    assert re.search("AGENT_LOCK_SID", text, re.I)


def test_t5_zwei_claims_derselben_sid_auf_verschiedenen_worktrees_beide_beschreibbar(ctx):
    repo = ctx["repo"]
    locks = ctx["locks"]
    (repo / "wt-chore").mkdir()
    (repo / "wt-chore/README.md").write_text("", encoding="utf-8")
    (locks / "ticket__T007956.json").write_text(
        '{"owner_sid":"double-sid","owner_pid":"9999","worktree":"%s/wt-chore",'
        '"branch":"chore/demo-T007956","label":"live"}\n' % repo,
        encoding="utf-8",
    )
    (locks / "ticket__T007559.json").write_text(
        '{"owner_sid":"double-sid","owner_pid":"9998","worktree":"%s/wt-other",'
        '"branch":"feature/demo-T007559","label":"live"}\n' % repo,
        encoding="utf-8",
    )

    # Implementer-Worktree (zweiter Claim): Schreiben muss erlaubt sein.
    assert _guard(ctx, str(repo / "wt-other/README.md"), agent_lock_sid="double-sid").returncode == 0
    # Orchestrator-Worktree (erster Claim): ebenfalls erlaubt.
    assert _guard(ctx, str(repo / "wt-chore/README.md"), agent_lock_sid="double-sid").returncode == 0
    # Ausserhalb beider Claims: weiterhin blockiert.
    assert _guard(ctx, str(repo / "README.md"), agent_lock_sid="double-sid").returncode == 2
