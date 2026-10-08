"""Native migration of tests/spec/mishap-bundle-T002506.bats."""

import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def ctx(repo_root, tmp_path):
    """BATS setup: Temp-Repo mit origin/main-Ref, eigenes AGENT_LOCK_DIR."""
    lock_dir = tmp_path / "agent-locks"
    lock_dir.mkdir()
    repo = tmp_path / "repo"
    repo.mkdir()
    env = {"AGENT_LOCK_DIR": str(lock_dir)}
    def git(*args):
        return subprocess.run(["git", *args], cwd=str(repo), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True, check=False)

    git("init", "-q", "-b", "main", ".")
    git("config", "user.email", "test@test.com")
    git("config", "user.name", "Test")
    git("commit", "-q", "--allow-empty", "-m", "Initial commit")
    # origin/main-Ref anlegen, damit check-merged/pruefende Skripte ihn finden
    git("branch", "origin/main")
    git("config", "--local", "core.hooksPath", "/dev/null")
    return {"repo_root": repo_root, "repo": repo, "lock_dir": lock_dir, "tmp": tmp_path, "env": env}


def _git(ctx, *args):
    return subprocess.run(["git", *args], cwd=str(ctx["repo"]), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, check=False)


def _run(run_cmd, ctx, args, extra_env=None):
    env = dict(ctx["env"])
    if extra_env:
        env.update(extra_env)
    return run_cmd(args, cwd=str(ctx["repo"]), env=env)


# ── M2: check-merged zaehlt nur [T-Nummer] im Betreff, nicht im Body ────

def test_m2_check_merged_ignoriert_ticket_id_nur_im_commit_body(run_cmd, ctx):
    _git(ctx, "commit", "-q", "--allow-empty", "-m", "chore(agents): Health-Gates auf Target [T002493] (#3561)",
         "-m", "Aufloesung erfordert eine Entscheidung, siehe [[T002494]].")
    # origin/main auf den neuen Stand bringen (Squash-Commit-Simulation)
    _git(ctx, "branch", "-f", "origin/main", "HEAD")
    r = _run(run_cmd, ctx, ["bash", str(ctx["repo_root"] / "scripts" / "agent-lock.sh"), "check-merged", "T002494"])
    assert r.returncode == 0, r.output


def test_m2_check_merged_findet_ticket_nummer_im_commit_betreff(run_cmd, ctx):
    _git(ctx, "commit", "-q", "--allow-empty", "-m", "fix(factory): Thinking-Gate baseUrl [T002501] (#3572)")
    _git(ctx, "branch", "-f", "origin/main", "HEAD")
    r = _run(run_cmd, ctx, ["bash", str(ctx["repo_root"] / "scripts" / "agent-lock.sh"), "check-merged", "T002501"])
    assert r.returncode == 1, r.output


# ── M7: post-merge-deploy findet Squash-Commit (1 Parent) ───────────────

def test_m7_post_merge_deploy_findet_squash_commit_mit_einem_parent(run_cmd, ctx):
    (ctx["repo"] / "change.txt").write_text("change\n", encoding="utf-8")
    _git(ctx, "add", "change.txt")
    _git(ctx, "commit", "-qm", "fix(factory): Thinking-Gate an lokaler baseUrl [T002501] (#3572)")
    _git(ctx, "branch", "-f", "origin/main", "HEAD")
    # Stub fuer scripts/filter-generated.sh: Passthrough, damit die Pipeline real durchlaeuft.
    (ctx["repo"] / "scripts").mkdir()
    (ctx["repo"] / "scripts" / "filter-generated.sh").write_text("#!/usr/bin/env bash\ncat\n", encoding="utf-8")
    r = _run(run_cmd, ctx, ["bash", str(ctx["repo_root"] / "scripts" / "devflow-post-merge-deploy.sh"), "T002501"])
    assert r.returncode == 0, r.output
    assert "Keine bekannten Deploy-Trigger" in r.output
    # CHANGED darf nicht leer sein.
    assert "change.txt" in r.output


# ── M3: agent-collision — Lock/Worktree-Branch-Mismatch erzeugt kein Alarm ─

def test_m3_lock_mit_branch_mismatch_worktree_erzeugt_keine_collision_warnung(run_cmd, ctx):
    peer_wt = ctx["tmp"] / "peer-wt"
    # Zweiten Branch + Worktree anlegen (peer); Fallback wie im Original.
    r = _git(ctx, "worktree", "add", "-q", "-b", "peer-branch", str(peer_wt), "main")
    if r.returncode != 0:
        _git(ctx, "checkout", "-q", "-b", "peer-branch")
    lock = ctx["lock_dir"] / "branch__peer-branch.json"
    lock.write_text(
        '{"scope":"branch","id":"peer-branch","owner_sid":"other-session","owner_pid":"999999","tool":"claude",'
        '"label":"dev-flow-fix","worktree":"REPLACE_WT","branch":"peer-branch","host":"test",'
        '"created_at":"1","heartbeat_at":"1"}\n'.replace("REPLACE_WT", str(ctx["repo"])),
        encoding="utf-8",
    )
    # Datei anlegen und stagen (als wuerde sie diese Session anfassen).
    (ctx["repo"] / "brand-new-file.txt").write_text("new\n", encoding="utf-8")
    _git(ctx, "add", "brand-new-file.txt")
    r = _run(run_cmd, ctx,
             ["bash", str(ctx["repo_root"] / "scripts" / "agent-collision.sh"), "check", "--staged", "--quiet"],
             extra_env={"AGENT_LOCK_FAKE_ALIVE": "other-session"})
    assert r.returncode == 0, r.output


# ── M6: plan-lint W3 erkennt ### Task (H3)-Headings ─────────────────────

def test_m6_plan_lint_w3_meldet_keine_false_negative_fuer_task_headings(run_cmd, ctx):
    plan = ctx["tmp"] / "plan-h3.md"
    plan.write_text(
        "---\n"
        "title: Test\n"
        "ticket_id: T000000\n"
        "domains: [test]\n"
        "status: plan_staged\n"
        "---\n"
        "\n"
        "# Implementation Plan: test\n"
        "\n"
        "## File Structure\n"
        "\n"
        "### Geänderte Dateien\n"
        "- `scripts/foo.sh` — test\n"
        "\n"
        "### Task 1: Foo\n"
        "\n"
        "**Purpose:** Test\n"
        "\n"
        "**Files:**\n"
        "- `scripts/foo.sh`\n"
        "\n"
        "**Steps:**\n"
        "1. Do something\n"
        "\n"
        "**Verify:**\n"
        "1. It works\n",
        encoding="utf-8",
    )
    # W3 ist advisory; geprueft wird, dass KEINE W3-Meldung fuer scripts/foo.sh erscheint.
    # Original laeuft ausserhalb von pushd, also im Repo-Root.
    r = run_cmd(["bash", str(ctx["repo_root"] / "scripts" / "plan-lint.sh"), str(plan)], cwd=str(ctx["repo_root"]))
    assert "W3: `scripts/foo.sh` is listed in File Structure but no task references it" not in r.output
