"""Native migration of tests/spec/local-dev-mesh/devmesh-taskfile.bats."""

import re
import shutil

import pytest


@pytest.fixture(autouse=True)
def _need_task(repo_root):
    if shutil.which("task") is None:
        pytest.skip("task not installed")


def test_t900116_task_list_fuehrt_devmesh_tailnet_check(repo_root, run_cmd):
    res = run_cmd(["task", "--list"], cwd=repo_root)
    assert res.returncode == 0, f"task --list exit={res.returncode}: {res.output}"
    assert "devmesh:tailnet:check" in res.output, "devmesh:tailnet:check fehlt in task --list"


def test_t900116_devmesh_tailnet_check_ruft_scripts_devmesh_tailnet_check_sh_ueber_bash_auf(repo_root, run_cmd):
    res = run_cmd(["task", "--dry", "devmesh:tailnet:check"], cwd=repo_root)
    assert res.returncode == 0, f"task --dry exit={res.returncode}: {res.output}"
    assert "bash scripts/devmesh/tailnet-check.sh" in res.output, f"Task startet das Skript nicht: {res.output}"


def test_t900117_task_devmesh_install_reicht_host_und_dry_run_an_k3s_install_sh_durch(repo_root, run_cmd):
    res = run_cmd(["task", "--dir", str(repo_root), "devmesh:install", "HOST=gpu-cluster", "DRY_RUN=1"])
    assert res.returncode == 0, res.output
    lines = [l for l in res.output.splitlines() if l.startswith("command: ")]
    line = "\n".join(lines)
    assert "--node-ip 10.10.10.2" in line
    assert "INSTALL_K3S_VERSION=v" in line
    assert sum(1 for l in lines if "--cluster-init" in l) == 0


def _yq_r(run_cmd, expr, inv):
    res = run_cmd(["yq", "-r", expr, str(inv)])
    res.check()
    return res.stdout.rstrip("\n")


def test_t900117_inventar_mit_gpu_metal_server_init_zwei_server_join_agent_gpu_cluster_3_storage_true_auf_gpu_cluster2_3_version_gepinnt(
    repo_root, run_cmd
):
    inv = repo_root / "devmesh" / "inventory.yaml"
    assert _yq_r(run_cmd, '[.peers[] | select(.k3s_role == "server-init")] | map(.name) | join(",")', inv) == "gpu-metal"
    assert _yq_r(run_cmd, '[.peers[] | select(.k3s_role == "server-join")] | map(.name) | sort | join(",")', inv) == \
        "gpu-cluster,gpu-cluster2"
    assert _yq_r(run_cmd, '[.peers[] | select(.k3s_role == "agent")] | map(.name) | sort | join(",")', inv) == \
        "gpu-cluster-3"
    assert _yq_r(run_cmd,
                 '[.peers[] | select(((.labels // []) | map(select(. == "storage=true")) | length) > 0)] '
                 '| map(.name) | sort | join(",")', inv) == "gpu-cluster-3,gpu-cluster2"
    version = _yq_r(run_cmd, ".k3s_version", inv)
    assert re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+\+k3s[0-9]+", version), version


def test_t900117_kein_client_traegt_eine_k3s_rolle_pk_desktop_ist_kein_knoten(repo_root, run_cmd):
    inv = repo_root / "devmesh" / "inventory.yaml"
    # Positiv-Anker: genau vier Hosts haben eine k3s-Rolle
    assert _yq_r(run_cmd, '[.peers[] | select((.k3s_role // "") != "")] | length', inv) == "4"
    roles = [r for r in _yq_r(run_cmd, '.peers[] | select(.role == "client") | .k3s_role // ""', inv).splitlines()
             if r]
    assert roles == []
