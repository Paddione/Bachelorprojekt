"""Native migration of tests/unit/wg-mesh-laptop-nodes.bats.

Ticket T006143. PRUEFMODUS: configuration guard (documented exception T002448-M4):
the registry result lives in YAML source and in the generated conf, so the
generated conf and registry entries are checked.
"""
import re

DUMMY_KEY = "0000000000000000000000000000000000000000000="
LAPTOP1_IP = "192.168.100.11"
TABLET_IP = "192.168.100.12"


def _after_context(text, needle, n):
    """Port of `grep -A<n> <needle>`: matching line plus n following lines."""
    lines = text.splitlines()
    out = []
    for idx, line in enumerate(lines):
        if needle in line:
            out.extend(lines[idx: idx + n + 1])
    return "\n".join(out)


def test_t006143_mentolder_mesh_confs_listen_die_laptops_als_peers(run_cmd, repo_root):
    script = repo_root / "scripts" / "hetzner" / "generate-wg-conf.sh"
    r = run_cmd(
        ["bash", str(script), "--env", "mentolder", "--node-name", "gekko-hetzner-3", "--private-key", DUMMY_KEY]
    )
    assert r.returncode == 0, r.output
    assert "# gekko-hetzner-3" not in r.output
    assert "# pk-l-1" in r.output
    assert f"AllowedIPs = {LAPTOP1_IP}/32" in r.output
    assert "# pk-tablet" in r.output
    assert f"AllowedIPs = {TABLET_IP}/32" in r.output


def test_t006143_registry_fuehrt_pk_l_1_und_pk_tablet_mit_festen_wg_ips(repo_root):
    registry = (repo_root / "wireguard" / "wg-mesh-nodes.yaml").read_text(encoding="utf-8")
    # Positive anchors: the node names exist in the registry.
    assert "name: pk-l-1" in registry
    assert "name: pk-tablet" in registry
    # Single assertions: wg_ip, empty endpoint (home NAT), schema key.
    assert 'wg_ip: "192.168.100.11"' in _after_context(registry, "name: pk-l-1", 3)
    assert 'endpoint: ""' in _after_context(registry, "name: pk-l-1", 3)
    assert "schema_key: WG_MESH_PKL1" in _after_context(registry, "name: pk-l-1", 4)
    assert 'wg_ip: "192.168.100.12"' in _after_context(registry, "name: pk-tablet", 3)
    assert 'endpoint: ""' in _after_context(registry, "name: pk-tablet", 3)
    assert "schema_key: WG_MESH_PKT" in _after_context(registry, "name: pk-tablet", 4)


def test_t006143_schema_kennt_die_neuen_wg_mesh_variablen(repo_root):
    schema = (repo_root / "environments" / "schema.yaml").read_text(encoding="utf-8")
    assert "WG_MESH_PKL1_PRIVATE_KEY" in schema
    assert "WG_MESH_PKT_PRIVATE_KEY" in schema
