"""Native migration of tests/spec/local-dev-mesh/devmesh-networks.bats."""

import pytest


@pytest.fixture
def reg(repo_root):
    return repo_root / "docs" / "agent-guide" / "registry" / "networks.yaml"


def _cidr(run_cmd, reg, net_id):
    res = run_cmd(["yq", "-r", f'.networks[] | select(.id == "{net_id}") | .cidr', str(reg)])
    res.check()
    return res.stdout.rstrip("\n")


def test_devmesh_netze_stehen_mit_10_52_0_0_16_und_10_53_0_0_16_in_der_registry(repo_root, run_cmd, reg):
    assert _cidr(run_cmd, reg, "devmesh-pod-cidr") == "10.52.0.0/16"
    assert _cidr(run_cmd, reg, "devmesh-service-cidr") == "10.53.0.0/16"


def test_devmesh_netze_ueberschneiden_weder_pod_cidr_fleet_noch_service_cidr_fleet(repo_root, run_cmd, reg):
    # Positiv-Anker: die fleet-Eintraege existieren, und der Registry-Check besteht
    assert _cidr(run_cmd, reg, "pod-cidr-fleet") == "10.42.0.0/16"
    assert _cidr(run_cmd, reg, "service-cidr-fleet") == "10.43.0.0/16"
    res = run_cmd(["node", "scripts/networks-check.mjs"], cwd=repo_root)
    assert res.returncode == 0, res.output
    res = run_cmd(["yq", "-r",
                   '.networks[] | select(.id == "devmesh-pod-cidr" or .id == "devmesh-service-cidr") '
                   '| (.overlaps // [])[] | .with', str(reg)])
    res.check()
    named = res.stdout.splitlines()
    assert "home-lan" in named
    fleet = [n for n in named if n in ("pod-cidr-fleet", "service-cidr-fleet")]
    assert fleet == []
