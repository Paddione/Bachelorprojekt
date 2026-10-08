"""Native migration of tests/spec/workstation-cluster-iso/assign-identity.bats."""
# Pruefmodus: command output verification. scripts/iso/autoinstall/assign-identity.sh runs against a
# fake target tree under tmp_path; the resulting /etc/hostname, /etc/hosts and cloud-init config are checked.

import pytest


@pytest.fixture
def ctx(repo_root, run_cmd, tmp_path, monkeypatch):
    target = tmp_path / "target"
    (target / "etc").mkdir(parents=True)
    (target / "var/log").mkdir(parents=True)
    (target / "etc/hosts").write_text("127.0.0.1\tlocalhost\n127.0.1.1\tws-node\n", encoding="utf-8")
    (target / "etc/hostname").write_text("ws-node\n", encoding="utf-8")

    node_map = tmp_path / "node-map"
    node_map.write_text(
        "# Kommentarzeile muss ignoriert werden\n"
        "aa:bb:cc:dd:ee:01  ws-node-1\n"
        "AA:BB:CC:DD:EE:02  ws-node-2\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("ASSIGN_IDENTITY_LOG", str(tmp_path / "assign.log"))

    def assign(node_map_path, macs):
        return run_cmd(
            ["bash", str(repo_root / "scripts/iso/autoinstall/assign-identity.sh"), str(target)],
            env={"NODE_MAP": str(node_map_path), "ASSIGN_IDENTITY_MACS": macs},
        )

    return {"target": target, "node_map": node_map, "assign": assign}


def test_assign_identity_mac_aus_der_node_map_setzt_den_zugeordneten_hostnamen(ctx):
    result = ctx["assign"](ctx["node_map"], "aa:bb:cc:dd:ee:01")
    assert result.returncode == 0, result.output
    target = ctx["target"]
    assert (target / "etc/hostname").read_text(encoding="utf-8").rstrip("\n") == "ws-node-1"
    hosts = (target / "etc/hosts").read_text(encoding="utf-8")
    assert any(line.startswith("127.0.1.1") and line.split()[1:] == ["ws-node-1"] for line in hosts.splitlines())


def test_assign_identity_gross_kleinschreibung_der_mac_ist_egal(ctx):
    result = ctx["assign"](ctx["node_map"], "AA:BB:CC:DD:EE:02")
    assert result.returncode == 0, result.output
    assert (ctx["target"] / "etc/hostname").read_text(encoding="utf-8").rstrip("\n") == "ws-node-2"


def test_assign_identity_unbekannte_mac_ergibt_einen_eindeutigen_fallback_namen(ctx):
    result = ctx["assign"](ctx["node_map"], "11:22:33:44:55:66")
    assert result.returncode == 0, result.output
    # Fallback = ws- plus die letzten drei Oktette.
    assert (ctx["target"] / "etc/hostname").read_text(encoding="utf-8").rstrip("\n") == "ws-445566"


def test_assign_identity_zwei_macs_treffer_gewinnt_gegen_nicht_treffer(ctx):
    result = ctx["assign"](ctx["node_map"], "99:99:99:99:99:99 aa:bb:cc:dd:ee:01")
    assert result.returncode == 0, result.output
    assert (ctx["target"] / "etc/hostname").read_text(encoding="utf-8").rstrip("\n") == "ws-node-1"


def test_assign_identity_cloud_init_darf_den_hostnamen_beim_ersten_boot_nicht_ueberschreiben(ctx):
    result = ctx["assign"](ctx["node_map"], "aa:bb:cc:dd:ee:01")
    assert result.returncode == 0, result.output
    cfg = ctx["target"] / "etc/cloud/cloud.cfg.d/99-preserve-hostname.cfg"
    assert "preserve_hostname: true" in cfg.read_text(encoding="utf-8")


def test_assign_identity_fehlende_node_map_bricht_die_installation_nicht_ab(ctx, tmp_path):
    # Exit 0 ist Absicht: ein late-command mit Exit != 0 laesst den gesamten Autoinstall scheitern.
    result = ctx["assign"](tmp_path / "gibt-es-nicht", "aa:bb:cc:dd:ee:01")
    assert result.returncode == 0, result.output
    hostname = (ctx["target"] / "etc/hostname").read_text(encoding="utf-8").rstrip("\n")
    assert hostname in ("ws-445566", "ws-ddee01")
