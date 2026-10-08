"""Native migration of tests/unit/wg-mesh-fullmesh.bats (T000371)."""
import pytest

DUMMY_KEY = "0000000000000000000000000000000000000000000="
PK4_IP = "10.20.0.1"
GEKKO2_IP = "10.20.0.4"
GEKKO3_IP = "10.20.0.5"
GEKKO4_IP = "10.20.0.6"


def gen_conf(run_cmd, repo_root, node):
    return run_cmd(
        ["bash", str(repo_root / "scripts/hetzner/generate-wg-conf.sh"),
         "--env", "fleet", "--node-name", node, "--private-key", DUMMY_KEY],
        timeout=300,
    )


def fleet_node_names(repo_root):
    """awk '/^fleet:/{f=1;next} /^[^[:space:]#]/{f=0} f && /- name:/{print $3}' wg-mesh-nodes.yaml"""
    names = []
    in_fleet = False
    for line in (repo_root / "wireguard/wg-mesh-nodes.yaml").read_text().splitlines():
        if line.startswith("fleet:"):
            in_fleet = True
            continue
        if line and not line[0].isspace() and line[0] != "#":
            in_fleet = False
        if in_fleet and "- name:" in line:
            fields = line.split()
            names.append(fields[2] if len(fields) > 2 else "")
    return names


def test_fleet_worker_config_peers_with_the_other_fleet_workers_full_mesh(run_cmd, repo_root):
    run = gen_conf(run_cmd, repo_root, "gekko-hetzner-4")
    assert run.returncode == 0, run.output
    # Die drei Control-Plane-Peers ...
    assert f"AllowedIPs = {PK4_IP}/32" in run.output
    # ... UND die beiden Schwester-Worker (die Regression).
    assert "# gekko-hetzner-2" in run.output
    assert f"AllowedIPs = {GEKKO2_IP}/32" in run.output
    assert "# gekko-hetzner-3" in run.output
    assert f"AllowedIPs = {GEKKO3_IP}/32" in run.output
    # Self darf nie Peer sein.
    assert "# gekko-hetzner-4" not in run.output


def test_fleet_control_plane_config_peers_with_the_fleet_workers(run_cmd, repo_root):
    run = gen_conf(run_cmd, repo_root, "pk-hetzner-4")
    assert run.returncode == 0, run.output
    assert "# gekko-hetzner-2" in run.output
    assert f"AllowedIPs = {GEKKO2_IP}/32" in run.output
    assert "# gekko-hetzner-4" in run.output
    assert f"AllowedIPs = {GEKKO4_IP}/32" in run.output
    assert "# pk-hetzner-4" not in run.output


def test_fleet_mesh_is_symmetric_every_worker_peers_with_every_cp_and_worker(run_cmd, repo_root):
    for self_name in ("gekko-hetzner-2", "gekko-hetzner-3", "gekko-hetzner-4"):
        run = gen_conf(run_cmd, repo_root, self_name)
        assert run.returncode == 0, run.output
        # Erwartet: jeder fleet-Knoten ausser self genau einmal als Peer; Menge aus der Registry.
        for other in fleet_node_names(repo_root):
            if other == self_name:
                continue
            assert f"# {other}" in run.output, f"{self_name}: Peer {other} fehlt"
        assert f"# {self_name}" not in run.output, f"{self_name} ist Peer seiner selbst"
