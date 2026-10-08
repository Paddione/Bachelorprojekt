"""Native migration of tests/spec/local-dev-mesh/kubeconfig.bats."""
import os
from pathlib import Path

import pytest

K3S_YAML = """apiVersion: v1
kind: Config
clusters:
- cluster:
    certificate-authority-data: Q0E=
    server: https://127.0.0.1:6443
  name: default
contexts:
- context:
    cluster: default
    user: default
  name: default
current-context: default
users:
- name: default
  user:
    client-certificate-data: Q0VSVA==
    client-key-data: S0VZ
"""

SSH_STUB = """#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$SSH_ARGV_LOG"
if [ -n "${STUB_SSH_RC:-}" ]; then exit "$STUB_SSH_RC"; fi
cat "$K3S_YAML"
"""

TARGET_KUBECONFIG = """apiVersion: v1
kind: Config
clusters:
  - name: fleet
    cluster: {server: "https://fleet.invalid:6443"}
  - name: devmesh
    cluster: {server: "https://stale.invalid:6443"}
users:
  - name: fleet
    user: {token: fleet-token}
  - name: devmesh
    user: {token: stale-token}
contexts:
  - name: fleet
    context: {cluster: fleet, user: fleet}
  - name: devmesh
    context: {cluster: devmesh, user: devmesh}
current-context: fleet
"""


@pytest.fixture
def mesh(repo_root: Path, tmp_path: Path) -> dict:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    ssh = bin_dir / "ssh"
    ssh.write_text(SSH_STUB)
    ssh.chmod(0o755)
    argv_log = tmp_path / "ssh-argv.log"
    argv_log.write_text("")
    k3s_yaml = tmp_path / "k3s.yaml"
    k3s_yaml.write_text(K3S_YAML)
    target = tmp_path / "kube" / "config"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(TARGET_KUBECONFIG)
    env = {
        "DEVMESH_INVENTORY": str(repo_root / "tests" / "spec" / "local-dev-mesh" / "fixtures" / "inventory.yaml"),
        "SSH_ARGV_LOG": str(argv_log),
        "K3S_YAML": str(k3s_yaml),
        "KUBECONFIG_TARGET": str(target),
    }
    return {
        "script": repo_root / "scripts" / "devmesh" / "kubeconfig.sh",
        "bin": bin_dir,
        "argv_log": argv_log,
        "target": target,
        "env": env,
    }


def _run(run_cmd, mesh, *args, extra_env=None):
    env = dict(mesh["env"])
    env["PATH"] = f"{mesh['bin']}{os.pathsep}{os.environ.get('PATH', '')}"
    if extra_env:
        env.update(extra_env)
    return run_cmd(["bash", str(mesh["script"]), *args], env=env)


def _yq(mesh, expr: str, run_cmd) -> str:
    return run_cmd(["yq", "-r", expr, str(mesh["target"])]).stdout.strip()


def _count_ctx(mesh, name: str, run_cmd) -> int:
    return int(_yq(mesh, f'[.contexts[] | select(.name == "{name}")] | length', run_cmd))


def _argv_log(mesh) -> str:
    return mesh["argv_log"].read_text(encoding="utf-8")


def test_default_server_devmesh_context_points_to_gpu_metal_tailnet_name_fleet_stays(run_cmd, mesh):
    result = _run(run_cmd, mesh)
    assert result.returncode == 0
    assert "patrick@10.1.0.101" in _argv_log(mesh)
    assert _count_ctx(mesh, "devmesh", run_cmd) == 1
    assert _count_ctx(mesh, "fleet", run_cmd) == 1
    assert _yq(mesh, '.clusters[] | select(.name == "devmesh") | .cluster.server', run_cmd) == \
        "https://gpu-metal.example-tailnet.ts.net:6443"
    assert _yq(mesh, '.users[] | select(.name == "devmesh") | .user."client-certificate-data"', run_cmd) == "Q0VSVA=="
    assert _yq(mesh, '.["current-context"]', run_cmd) == "fleet"


def test_server_gpu_cluster_switches_context_to_gpu_cluster(run_cmd, mesh):
    result = _run(run_cmd, mesh, "gpu-cluster")
    assert result.returncode == 0
    assert "patrick@10.10.10.2" in _argv_log(mesh)
    assert _yq(mesh, '.clusters[] | select(.name == "devmesh") | .cluster.server', run_cmd) == \
        "https://gpu-cluster.example-tailnet.ts.net:6443"


def test_missing_target_file_is_created_and_current_context_is_devmesh(run_cmd, mesh):
    mesh["target"].unlink()
    result = _run(run_cmd, mesh)
    assert result.returncode == 0
    assert _count_ctx(mesh, "devmesh", run_cmd) == 1
    assert _yq(mesh, '.["current-context"]', run_cmd) == "devmesh"


def test_client_instead_of_server_exits_1_no_ssh_target_unchanged(run_cmd, mesh):
    before = mesh["target"].read_bytes()
    assert _count_ctx(mesh, "fleet", run_cmd) == 1
    result = _run(run_cmd, mesh, "pk-desktop")
    assert result.returncode == 1
    assert _argv_log(mesh) == ""
    assert mesh["target"].read_bytes() == before


def test_ssh_unreachable_exits_2_target_unchanged(run_cmd, mesh):
    before = mesh["target"].read_bytes()
    result = _run(run_cmd, mesh, extra_env={"STUB_SSH_RC": "255"})
    assert result.returncode == 2
    assert "patrick@10.1.0.101" in _argv_log(mesh)
    assert mesh["target"].read_bytes() == before
