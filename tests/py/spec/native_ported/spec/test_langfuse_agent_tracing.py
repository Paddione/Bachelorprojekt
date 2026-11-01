"""Langfuse retirement: local deployments and public fleet routes stay absent."""

import subprocess

import pytest


@pytest.mark.parametrize("profile", ["core", "full"])
def test_devmesh_does_not_deploy_langfuse(repo_root, profile):
    result = subprocess.run(
        ["bash", str(repo_root / "scripts/devmesh/render-stack.sh"), profile],
        cwd=repo_root, capture_output=True, text=True, timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert "langfuse" not in result.stdout.lower()


def test_fleet_does_not_expose_retired_langfuse_proxy(repo_root):
    result = subprocess.run(
        ["kubectl", "kustomize", str(repo_root / "prod-fleet/korczewski")],
        cwd=repo_root, capture_output=True, text=True, timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert "langfuse-dev-proxy" not in result.stdout
    assert "workspace-ingress-langfuse-dev" not in result.stdout
