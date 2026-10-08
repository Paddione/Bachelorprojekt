"""Native migration of tests/spec/fleet-operations/wg-gpu-pod-cidr.bats."""
from pathlib import Path

import pytest

DUMMY_KEY = "0000000000000000000000000000000000000000000="
GPU_HOST = "wsl2-gpu-mentolder"


@pytest.fixture
def script(repo_root: Path) -> Path:
    return repo_root / "scripts" / "hetzner" / "generate-wg-conf.sh"


def _generate(run_cmd, repo_root: Path, script: Path, node: str):
    return run_cmd(
        ["bash", str(script), "--env", "mentolder", "--node-name", node, "--private-key", DUMMY_KEY],
        cwd=repo_root,
        timeout=300,
    )


def test_generator_emits_a_usable_wg_gpu_config_for_the_gpu_host(repo_root, script, run_cmd):
    res = _generate(run_cmd, repo_root, script, GPU_HOST)
    assert res.returncode == 0, res.output
    assert "[Interface]" in res.output
    peers = sum(1 for line in res.output.splitlines() if line.startswith("[Peer]"))
    assert peers >= 3


def test_gpu_host_config_lists_every_fleet_control_plane_node_as_a_peer(repo_root, script, run_cmd):
    res = _generate(run_cmd, repo_root, script, GPU_HOST)
    assert res.returncode == 0, res.output
    for node in ("pk-hetzner-4", "pk-hetzner-6", "pk-hetzner-8"):
        assert f"# {node}" in res.output, f"control-plane node {node} missing from GPU host peer list"


def test_gpu_host_config_carries_the_pod_cidr_of_every_kubernetes_peer(repo_root, script, run_cmd):
    res = _generate(run_cmd, repo_root, script, GPU_HOST)
    assert res.returncode == 0, res.output
    # wg_ip -> pod_cidr, wie im Cluster vergeben (kubectl get nodes -o ...podCIDR).
    pairs = [
        ("192.168.100.33", "10.42.0.0/24"),
        ("192.168.100.34", "10.42.1.0/24"),
        ("192.168.100.35", "10.42.2.0/24"),
        ("192.168.100.32", "10.42.3.0/24"),
        ("192.168.100.31", "10.42.5.0/24"),
    ]
    for wg, cidr in pairs:
        assert f"AllowedIPs = {wg}/32, {cidr}" in res.output, \
            f"missing combined AllowedIPs for {wg} (want pod CIDR {cidr})\n--- generated ---\n{res.output}"


def test_kubernetes_node_config_keeps_plain_32_allowedips_no_pod_cidr(repo_root, script, run_cmd):
    res = _generate(run_cmd, repo_root, script, "pk-hetzner-4")
    assert res.returncode == 0, res.output
    # Positiv-Anker: der GPU-Host ist als Peer vorhanden ...
    assert "AllowedIPs = 192.168.100.10/32" in res.output
    # ... und KEINE Zeile dieser Konfiguration nennt ein Pod-CIDR.
    assert "10.42." not in res.output
