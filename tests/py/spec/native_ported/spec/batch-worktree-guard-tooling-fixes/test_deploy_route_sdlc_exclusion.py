"""Native migration of tests/spec/batch-worktree-guard-tooling-fixes/deploy-route-sdlc-exclusion.bats."""

import os
import shutil
import stat

import pytest


def _git(run_cmd, cwd, *args):
    result = run_cmd(["git", *args], cwd=cwd)
    assert result.returncode == 0, result.output
    return result


def _stub(path, body):
    path.write_text(body, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


@pytest.fixture
def fixture_dir(repo_root, run_cmd, tmp_path):
    fixture = tmp_path / "fixture"
    fixture.mkdir()

    _git(run_cmd, fixture, "init")
    _git(run_cmd, fixture, "config", "user.email", "test@example.com")
    _git(run_cmd, fixture, "config", "user.name", "Test User")
    # Commit 0: leerer Basis-Commit als Parent der Fall-Commits.
    _git(run_cmd, fixture, "commit", "--allow-empty", "-m", "initial")
    _git(run_cmd, fixture, "update-ref", "refs/remotes/origin/main", "HEAD")

    # SUT ins Fixture kopieren (live Stand).
    (fixture / "scripts").mkdir()
    (fixture / "bin").mkdir()
    shutil.copy(repo_root / "scripts/devflow-post-merge-deploy.sh",
                fixture / "scripts/devflow-post-merge-deploy.sh")

    # Stubs untracked im Arbeitsbaum (git diff-tree liest nur den Commit).
    _stub(fixture / "scripts/filter-generated.sh", "cat; exit 0\n")
    _stub(fixture / "scripts/ticket.sh", 'echo "ticket.sh: $*"; exit 0\n')
    _stub(fixture / "scripts/devflow-post-merge-ticket-closure.sh", "exit 0\n")
    # task-Stub: einziger Indikator, ob `task feature:deploy` ausgeloest wurde.
    _stub(fixture / "bin/task", 'echo "task called: $*"; exit 0\n')
    return fixture


def _run_deploy(run_cmd, fixture):
    env = {"PATH": f"{fixture / 'bin'}{os.pathsep}{os.environ.get('PATH', '')}"}
    return run_cmd(["bash", "scripts/devflow-post-merge-deploy.sh", "T004295"], cwd=fixture, env=env)


def _commit_and_mark(run_cmd, fixture, message):
    _git(run_cmd, fixture, "commit", "-m", message)
    _git(run_cmd, fixture, "update-ref", "refs/remotes/origin/main", "HEAD")


def test_fall_1_changed_only_k3d_websocket_yaml_status_0_deploye_k8s_manifeste_task_called(repo_root, run_cmd, fixture_dir):
    fixture = fixture_dir
    (fixture / "k3d").mkdir()
    (fixture / "k3d/websocket.yaml").touch()
    _git(run_cmd, fixture, "add", "k3d/websocket.yaml")
    _commit_and_mark(run_cmd, fixture, "[T004295] fixture 1")

    result = _run_deploy(run_cmd, fixture)
    assert result.returncode == 0, result.output
    assert "Deploye K8s-Manifeste" in result.output
    assert "task called: feature:deploy" in result.output


def test_fall_2_changed_only_k3d_sdlc_stack_status_0_keine_bekannte_deploy_trigger(repo_root, run_cmd, fixture_dir):
    fixture = fixture_dir
    (fixture / "k3d/sdlc-stack").mkdir(parents=True)
    (fixture / "k3d/sdlc-stack/sdlc-console.yaml").touch()
    (fixture / "k3d/sdlc-stack/kustomization.yaml").touch()
    _git(run_cmd, fixture, "add", "k3d/sdlc-stack/")
    _commit_and_mark(run_cmd, fixture, "[T004295] fixture 2")

    result = _run_deploy(run_cmd, fixture)
    assert result.returncode == 0, result.output
    assert "Keine bekannten Deploy-Trigger" in result.output
    assert "task called:" not in result.output
    # Die "Geaenderte Dateien"-Liste zeigt den gefilterten $CHANGED.
    assert "k3d/sdlc-stack" not in result.output


def test_fall_3_changed_k3d_websocket_yaml_and_sdlc_stack_task_called_sdlc_stack_not_in_list(repo_root, run_cmd, fixture_dir):
    fixture = fixture_dir
    (fixture / "k3d/sdlc-stack").mkdir(parents=True)
    (fixture / "k3d/websocket.yaml").touch()
    (fixture / "k3d/sdlc-stack/sdlc-console.yaml").touch()
    _git(run_cmd, fixture, "add", "k3d/websocket.yaml", "k3d/sdlc-stack/sdlc-console.yaml")
    _commit_and_mark(run_cmd, fixture, "[T004295] fixture 3")

    result = _run_deploy(run_cmd, fixture)
    assert result.returncode == 0, result.output
    assert "task called: feature:deploy" in result.output
    # Regression: der Filter entfernt nur sdlc-stack-Pfade.
    assert "k3d/sdlc-stack" not in result.output
