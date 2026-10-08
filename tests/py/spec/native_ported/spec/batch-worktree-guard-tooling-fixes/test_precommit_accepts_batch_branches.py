"""Native migration of tests/spec/batch-worktree-guard-tooling-fixes/precommit-accepts-batch-branches.bats."""

import os
import stat

import pytest

# Hook, Helfer und Locks, die der Fixture-Repo per Symlink zur Verfuegung gestellt werden.
SYMLINKS = [
    (".githooks/pre-commit", ".githooks/pre-commit"),
    ("scripts/agent-lock.sh", "scripts/agent-lock.sh"),
    ("scripts/agent-collision.sh", "scripts/agent-collision.sh"),
    ("scripts/git-crypt-guard.sh", "scripts/git-crypt-guard.sh"),
    ("scripts/plan-half-archive-check.sh", "scripts/plan-half-archive-check.sh"),
    ("scripts/plan-main-staging-guard.sh", "scripts/plan-main-staging-guard.sh"),
    ("scripts/lib/branch-allowlist.sh", "scripts/lib/branch-allowlist.sh"),
    (".gitleaks.toml", ".gitleaks.toml"),
    ("scripts/agent-lock-identity.sh", "scripts/agent-lock-identity.sh"),
    ("scripts/agent-lock-guards.sh", "scripts/agent-lock-guards.sh"),
    ("scripts/agent-lock-merged.sh", "scripts/agent-lock-merged.sh"),
    ("scripts/agent-lock-activity.sh", "scripts/agent-lock-activity.sh"),
    # [T900023] Reap-Logik liegt seit der S1-Aufteilung in einem eigenen Fragment.
    ("scripts/agent-lock-reap.sh", "scripts/agent-lock-reap.sh"),
]


def _git(run_cmd, cwd, *args):
    result = run_cmd(["git", *args], cwd=cwd)
    assert result.returncode == 0, result.output
    return result


@pytest.fixture
def fixture_repo(repo_root, run_cmd, tmp_path, monkeypatch):
    for var in ("AGENT_LOCK_FORCE", "SKIP_FRESHNESS_REGEN", "SKIP_MAIN_COMMIT_GUARD", "SKIP_BRANCH_CHECK"):
        monkeypatch.delenv(var, raising=False)

    fixture = tmp_path / "repo"
    (fixture / ".githooks").mkdir(parents=True)
    (fixture / "scripts/lib").mkdir(parents=True)
    (fixture / "bin").mkdir()

    for rel_target, rel_link in SYMLINKS:
        os.symlink(repo_root / rel_target, fixture / rel_link)

    # PATH-Stub fuer gitleaks.
    gitleaks = fixture / "bin/gitleaks"
    gitleaks.write_text('#!/bin/bash\necho "gitleaks stub"; exit 0\n', encoding="utf-8")
    gitleaks.chmod(gitleaks.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    _git(run_cmd, fixture, "init", "-b", "feat/batch-demo-T003123")
    _git(run_cmd, fixture, "config", "user.email", "test@example.com")
    _git(run_cmd, fixture, "config", "user.name", "Test User")
    (fixture / "sample.txt").touch()
    _git(run_cmd, fixture, "add", "sample.txt")
    _git(run_cmd, fixture, "commit", "-m", "chore: init")
    return fixture


def _hook_env(fixture):
    return {
        "PATH": f"{fixture / 'bin'}{os.pathsep}{os.environ.get('PATH', '')}",
        "AGENT_LOCK_FORCE": "1",
        "SKIP_FRESHNESS_REGEN": "1",
        "SKIP_MAIN_COMMIT_GUARD": "1",
        # SKIP_BRANCH_CHECK bleibt unset.
    }


def test_test_1_branch_experiment_foo_status_ungleich_0_output_contains_branch_name(run_cmd, fixture_repo):
    _git(run_cmd, fixture_repo, "checkout", "-b", "experiment/foo")

    result = run_cmd(["bash", str(fixture_repo / ".githooks/pre-commit")],
                     cwd=fixture_repo, env=_hook_env(fixture_repo))

    assert result.returncode != 0
    assert "experiment/foo" in result.output


def test_test_2_branch_feat_batch_demo_T003123_status_0(run_cmd, fixture_repo):
    # Already on feat/batch-demo-T003123 from setup.
    result = run_cmd(["bash", str(fixture_repo / ".githooks/pre-commit")],
                     cwd=fixture_repo, env=_hook_env(fixture_repo))

    if result.returncode != 0:
        print(f"DEBUG: status is {result.returncode}")
        print(f"DEBUG: output is: {result.output}")
    assert result.returncode == 0, result.output
