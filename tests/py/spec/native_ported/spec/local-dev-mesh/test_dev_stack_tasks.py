"""Native migration of tests/spec/local-dev-mesh/dev-stack-tasks.bats."""

import re
import shutil

import pytest


@pytest.fixture(autouse=True)
def _need_task(repo_root):
    if shutil.which("task") is None:
        pytest.skip("task binary not installed")


def test_dev_redeploy_website_triggers_rollout_restart_without_local_docker_build(repo_root, run_cmd):
    res = run_cmd(["task", "--dry", "dev:redeploy:website"], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "rollout restart deploy/website" in res.output
    assert not re.search(r"(docker build|k3d image import)", res.output)


def test_dev_redeploy_brett_triggers_rollout_restart_without_local_docker_build(repo_root, run_cmd):
    res = run_cmd(["task", "--dry", "dev:redeploy:brett"], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "rollout restart deploy/brett" in res.output
    assert not re.search(r"(docker build|k3d image import)", res.output)


def test_dev_secrets_is_present_and_targets_ns_dev(repo_root, run_cmd):
    res = run_cmd(["task", "--dry", "dev:secrets"], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "shared-db-dev-secrets" in res.output
    # Darf nicht im cert-manager Namespace anlegen
    assert not re.search(r"create namespace cert-manager|secret.*ipv64-api-key", res.output)
