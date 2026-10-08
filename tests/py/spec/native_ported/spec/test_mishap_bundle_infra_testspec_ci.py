"""Native migration of tests/spec/mishap-bundle-infra-testspec-ci.bats."""

import os
import re
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root):
    """BATS setup: Pfade zu Skripten und Dokumenten im Repo."""
    return {
        "repo": repo_root,
        "lock": str(repo_root / "scripts" / "agent-lock.sh"),
        "wt_create": str(repo_root / "scripts" / "worktree-create.sh"),
        "post_merge": repo_root / "scripts" / "devflow-post-merge-deploy.sh",
        "verify_sh": repo_root / "scripts" / "devflow-verify.sh",
        "claude_md": repo_root / "CLAUDE.md",
        "skill_md": repo_root / ".agents" / "skills" / "dev-flow-plan" / "SKILL.md",
        "ci_yml": repo_root / ".github" / "workflows" / "ci.yml",
        "commit_msg_hook": repo_root / ".githooks" / "commit-msg",
    }


def _git(run_cmd, cwd, *args):
    return run_cmd(["git", "-C", str(cwd), *args])


# ── M1: worktree-create.sh non-main abort ─────────────────────────────

def test_t002448_m1_worktree_create_sh_rejects_running_on_a_non_main_branch(run_cmd, paths, tmp_path):
    test_repo = tmp_path / "test-repo"
    test_repo.mkdir()
    wt_path = tmp_path / "wt-m1"
    run_cmd(["git", "init", "-q", str(test_repo)])
    _git(run_cmd, test_repo, "config", "user.email", "test@test")
    _git(run_cmd, test_repo, "config", "user.name", "Test")
    # main mit Commit und origin/main-Ref, damit Divergenz-Guard und worktree add passen.
    _git(run_cmd, test_repo, "checkout", "-q", "-b", "main")
    _git(run_cmd, test_repo, "commit", "-q", "--allow-empty", "-m", "initial on main")
    _git(run_cmd, test_repo, "update-ref", "refs/remotes/origin/main", "main")
    # Auf nicht-main Branch wechseln.
    _git(run_cmd, test_repo, "checkout", "-q", "-b", "non-main-branch")
    _git(run_cmd, test_repo, "commit", "-q", "--allow-empty", "-m", "on non-main")
    r = run_cmd(["bash", "-c", f"cd '{test_repo}' && bash '{paths['wt_create']}' test-br '{wt_path}'"])
    assert r.returncode != 0
    assert "main" in r.output


# ── M2: commit-msg rejection clarity ──────────────────────────────────

def test_t002448_m2_commit_msg_hook_emits_clear_rejection_mentioning_no_commit_was_created(run_cmd, paths, tmp_path):
    test_repo = tmp_path / "hook-repo"
    test_repo.mkdir()
    _git(run_cmd, test_repo, "init", "-q")
    _git(run_cmd, test_repo, "config", "user.email", "test@test")
    _git(run_cmd, test_repo, "config", "user.name", "Test")
    (test_repo / ".githooks").mkdir()
    os.symlink(paths["commit_msg_hook"], test_repo / ".githooks" / "commit-msg")
    _git(run_cmd, test_repo, "config", "core.hooksPath", ".githooks")
    (test_repo / "test.txt").write_text("content\n", encoding="utf-8")
    _git(run_cmd, test_repo, "add", "test.txt")
    # Nicht konforme Commit-Betreffzeile.
    r = run_cmd(["git", "commit", "-m", "bad msg"], cwd=str(test_repo))
    assert r.returncode != 0
    assert "No commit was created" in r.output
    assert "SKIP_COMMIT" not in r.output


# ── M3: agent-lock worktree path normalization ────────────────────────

def test_t002448_m3_agent_lock_claim_worktree_dot_stores_absolute_canonical_path(run_cmd, paths, tmp_path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    testdir = tmp_path / "testdir"
    testdir.mkdir()
    env = {"AGENT_LOCK_DIR": str(lock_dir), "AGENT_LOCK_SID": "m3-test"}
    run_cmd(["bash", paths["lock"], "claim", "branch", "t", "--worktree", "."], cwd=str(testdir), env=env)
    lf = lock_dir / "branch__t.json"
    assert lf.is_file()
    m = re.findall(r'"worktree": *"[^"]*"', lf.read_text(encoding="utf-8"))
    wt_field = m[0].split(":", 1)[1].strip().strip('"') if m else ""
    # Absolut, kanonisch, ohne Trailing-Slash.
    assert wt_field.startswith("/")
    assert "/." not in wt_field
    assert "/.." not in wt_field
    assert not wt_field.endswith("/")


# ── M4: CLAUDE.md advises output checking over source grepping ────────

def test_t002448_m4_claude_md_advises_checking_command_outputs_results_rather_than_grepping_source(paths):
    text = paths["claude_md"].read_text(encoding="utf-8")
    assert re.search(r"command output|check.*result|run.*command.*rather.*grep|output.*behavior|output.*verification",
                     text)


# ── M5: dev-flow-plan SKILL.md cause-verification text ────────────────

def test_t002448_m5_dev_flow_plan_skill_md_documents_bug_cause_verification_during_triage(paths):
    text = paths["skill_md"].read_text(encoding="utf-8")
    assert re.search(r"cause.*verif|valid.*cause|triage.*cause|root.cause.*verif|bug.*cause.*triage", text)


# ── M6: ci.yml unbounded range check ──────────────────────────────────

def test_t002448_m6_ci_yml_commit_vs_diff_section_avoids_unbounded_base_sha_head_sha_range(paths):
    assert "${BASE_SHA}..${HEAD_SHA}" not in paths["ci_yml"].read_text(encoding="utf-8")


# ── M7: devflow-verify.sh exists ──────────────────────────────────────

def test_t002448_m7_devflow_verify_sh_exists_is_executable_and_contains_timeout_background_keywords(paths):
    p = paths["verify_sh"]
    assert p.is_file() and os.access(p, os.X_OK)
    text = p.read_text(encoding="utf-8")
    assert "timeout" in text
    assert "background" in text


# ── M8: agent-lock reap PID-dead beats SID-alive ──────────────────────

def test_t002448_m8_agent_lock_reap_removes_lock_with_dead_pid_once_the_heartbeat_is_stale(run_cmd, paths, tmp_path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    env = {"AGENT_LOCK_DIR": str(lock_dir)}
    # Claim mit nicht-numerischer SID (von _sid_alive als lebend gewertet).
    run_cmd(["bash", paths["lock"], "claim", "ticket", "t2448-m8", "--label", "mishap8"],
            env={**env, "AGENT_LOCK_SID": "still-alive-m8"})
    lf = lock_dir / "ticket__t2448-m8.json"
    assert lf.is_file()

    # owner_pid auf einen garantiert toten PID setzen.
    text = lf.read_text(encoding="utf-8")
    lf.write_text(re.sub(r'"owner_pid": "[0-9]*"', '"owner_pid": "999999"', text), encoding="utf-8")

    # Positiv-Anker: mit frischem Heartbeat MUSS der Lock den reap ueberleben.
    run_cmd(["bash", paths["lock"], "reap"], env=env)
    assert lf.is_file()

    # Heartbeat veralten lassen: der Halter ist wirklich weg.
    run_cmd(["bash", paths["lock"], "reap"], env={**env, "AGENT_LOCK_TTL": "0"})
    assert not lf.exists()


# ── M9: devflow-post-merge-deploy fragile git log ─────────────────────

def test_t002448_m9_devflow_post_merge_deploy_sh_avoids_fragile_git_log_origin_main_1_pattern(paths):
    assert "git log origin/main -1" not in paths["post_merge"].read_text(encoding="utf-8")


# ── M10: devflow-post-merge-deploy ticket ID match ────────────────────

def test_t002448_m10_devflow_post_merge_deploy_sh_matches_ticket_ids_with_grep_t00_pattern(paths):
    assert re.search(r"grep.*T00", paths["post_merge"].read_text(encoding="utf-8"))
