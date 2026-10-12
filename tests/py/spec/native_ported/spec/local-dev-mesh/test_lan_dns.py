"""LAN-DNS (AdGuard Home) in devmesh [T016515].

Pruefmodus: gerenderte Manifeste (kubectl kustomize) und Ausgabe der Skripte im
DRY_RUN, kein Quelltext-grep.
"""

import ipaddress
import re
import shutil

import pytest
import yaml


@pytest.fixture(scope="module")
def rendered(repo_root):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl binary not installed")
    import subprocess

    res = subprocess.run(
        ["kubectl", "kustomize", str(repo_root / "dev-local" / "lan-dns")],
        capture_output=True, text=True, timeout=120,
    )
    assert res.returncode == 0, res.stderr
    docs = [d for d in yaml.safe_load_all(res.stdout) if d]
    return {(d["kind"], d["metadata"]["name"]): d for d in docs}


def _one(rendered, kind, prefix):
    hits = [d for (k, n), d in rendered.items() if k == kind and n.startswith(prefix)]
    assert len(hits) == 1, f"{kind}/{prefix}*: {len(hits)} Treffer"
    return hits[0]


def _adguard_config(rendered):
    cm = _one(rendered, "ConfigMap", "adguard-config")
    return yaml.safe_load(cm["data"]["AdGuardHome.yaml"])


def test_daemonset_mit_hostnetwork_nur_auf_lan_dns_nodes(rendered):
    ds = _one(rendered, "DaemonSet", "adguard")
    spec = ds["spec"]["template"]["spec"]
    assert ds["metadata"]["namespace"] == "lan-dns"
    # hostNetwork: AdGuard bindet die LAN-IP des Nodes selbst, keine hostPort-DNAT (T016520).
    assert spec["hostNetwork"] is True
    assert spec["nodeSelector"] == {"lan-dns": "true"}
    image = spec["containers"][0]["image"]
    assert re.fullmatch(r"adguard/adguardhome:v\d+\.\d+\.\d+", image), image
    assert spec["dnsPolicy"] == "None"
    assert not [n for (k, n) in rendered if k == "Deployment"]


def test_kein_service_bietet_port_53_ueber_node_ports_an(rendered):
    # Positiv-Anker: der Tailnet-Service existiert als ClusterIP mit Port 53.
    svc = _one(rendered, "Service", "adguard-dns")
    assert svc["spec"].get("type", "ClusterIP") == "ClusterIP"
    assert {(53, "UDP"), (53, "TCP")} <= {(p["port"], p["protocol"]) for p in svc["spec"]["ports"]}
    ann = svc["metadata"]["annotations"]
    assert ann["tailscale.com/expose"] == "true"
    assert ann["tailscale.com/hostname"] == "lan-dns"
    assert ann["tailscale.com/tags"] == "tag:lan-dns"
    # ServiceLB/NodePort auf 53 setzt hostPort-DNAT, die auch 127.0.0.53 des Nodes kapert (T016520).
    node_exposed = [
        n for (k, n), d in rendered.items()
        if k == "Service" and d["spec"].get("type") in ("LoadBalancer", "NodePort")
        and any(p["port"] == 53 for p in d["spec"]["ports"])
    ]
    assert node_exposed == []
    host_ports = [
        p for c in _one(rendered, "DaemonSet", "adguard")["spec"]["template"]["spec"]["containers"]
        for p in c.get("ports", []) if "hostPort" in p
    ]
    assert host_ports == []


def test_init_container_setzt_die_node_ip_als_bind_adresse(rendered, run_cmd, tmp_path):
    spec = _one(rendered, "DaemonSet", "adguard")["spec"]["template"]["spec"]
    init = spec["initContainers"][0]
    env = {e["name"]: e for e in init["env"]}
    assert env["HOST_IP"]["valueFrom"]["fieldRef"]["fieldPath"] == "status.hostIP"
    # Den Init-Befehl lokal ausfuehren, Pfade auf tmp_path umgebogen.
    script = init["command"][-1].replace("/config-ro", str(tmp_path / "ro")).replace(
        "/opt/adguardhome/conf", str(tmp_path / "conf"))
    (tmp_path / "ro").mkdir()
    (tmp_path / "conf").mkdir()
    cm = _one(rendered, "ConfigMap", "adguard-config")
    (tmp_path / "ro" / "AdGuardHome.yaml").write_text(cm["data"]["AdGuardHome.yaml"])
    import os
    fake_hash = "$2b$10$" + "abcdefghijklmnopqrstuv" + "/ABCDEFGHIJKLMNOPQRSTUVWXYZ0123."
    res = run_cmd(["sh", "-c", script], env={**os.environ, "HOST_IP": "10.10.10.2", "ADMIN_HASH": fake_hash})
    res.check()
    cfg = yaml.safe_load((tmp_path / "conf" / "AdGuardHome.yaml").read_text())
    assert cfg["dns"]["bind_hosts"] == ["10.10.10.2"]
    assert cfg["users"] == [{"name": "admin", "password": fake_hash}]
    assert env["ADMIN_HASH"]["valueFrom"]["secretKeyRef"] == {"name": "adguard-admin", "key": "bcrypt"}


def test_web_ui_nur_auf_localhost_im_pod(rendered):
    cfg = _adguard_config(rendered)
    # Positiv-Anker: die UI ist konfiguriert, aber nur auf localhost gebunden.
    assert cfg["http"]["address"] == "127.0.0.1:3000"
    exposed = [
        n for (k, n), d in rendered.items()
        if k == "Service" and any(p["port"] == 3000 for p in d["spec"]["ports"])
    ]
    assert exposed == []
    assert not [n for (k, n) in rendered if k in ("Ingress", "IngressRoute")]


def test_upstreams_nur_ip_literale_keine_schleife_ueber_die_fritzbox(rendered):
    dns = _adguard_config(rendered)["dns"]
    entries = list(dns["upstream_dns"]) + list(dns["bootstrap_dns"])
    # Positiv-Anker: es gibt Upstreams und Bootstrap-Server.
    assert dns["upstream_dns"] and dns["bootstrap_dns"]
    for entry in entries:
        target = re.sub(r"^\[/[^\]]*/\]", "", entry)
        host = re.sub(r"^[a-z]+://", "", target).split("/")[0]
        host = host.rsplit(":", 1)[0] if host.count(":") == 1 else host
        ipaddress.ip_address(host)


def test_konfiguration_passt_zu_fritzbox_und_tailnet(rendered):
    dns = _adguard_config(rendered)["dns"]
    assert dns["ratelimit"] == 0
    assert dns["enable_dnssec"] is True
    assert dns["cache_optimistic"] is True
    assert "[/fritz.box/home/]10.0.0.1" in dns["upstream_dns"]
    assert dns["local_ptr_upstreams"] == ["10.0.0.1"]


@pytest.fixture
def inventory(tmp_path, monkeypatch):
    inv = tmp_path / "inventory.yaml"
    inv.write_text(
        "k3s_version: v1.36.1+k3s1\n"
        "peers:\n"
        "  - {name: srv-a, role: server, lan_ip: 10.10.10.2, tailnet_name: srv-a, k3s_role: server-init,"
        " subnet_routes: [10.0.0.0/24], lan_dns: true}\n"
        "  - {name: srv-b, role: server, lan_ip: 10.10.10.3, tailnet_name: srv-b, k3s_role: agent}\n"
        "  - {name: client-x, role: client, lan_ip: 10.10.0.3, tailnet_name: client-x}\n"
    )
    monkeypatch.setenv("DEVMESH_INVENTORY", str(inv))
    monkeypatch.setenv("DRY_RUN", "1")
    return inv


def test_firewall_dry_run_oeffnet_port_53_auf_jedem_k3s_host(repo_root, run_cmd, inventory):
    res = run_cmd(["bash", str(repo_root / "scripts/devmesh/lan-dns-firewall.sh")])
    assert res.returncode == 0, res.output
    for ip in ("10.10.10.2", "10.10.10.3"):
        host_lines = [l for l in res.stdout.splitlines() if ip in l]
        assert any("port 53 proto udp" in l for l in host_lines), res.output
        assert any("port 53 proto tcp" in l for l in host_lines), res.output
    assert "10.10.0.3" not in res.stdout


def test_subnet_routes_dry_run_nur_fuer_peers_mit_subnet_routes(repo_root, run_cmd, inventory):
    res = run_cmd(["bash", str(repo_root / "scripts/devmesh/tailnet-subnet-routes.sh")])
    assert res.returncode == 0, res.output
    lines = [l for l in res.stdout.splitlines() if "--advertise-routes=" in l]
    assert len(lines) == 1, res.output
    assert "10.10.10.2" in lines[0] and "--advertise-routes=10.0.0.0/24" in lines[0]


def test_task_dns_deploy_ruft_das_deploy_skript(repo_root, run_cmd):
    if shutil.which("task") is None:
        pytest.skip("task binary not installed")
    res = run_cmd(["task", "--dry", "devmesh:dns:deploy"], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "scripts/devmesh/lan-dns-deploy.sh" in res.output


def test_deploy_dry_run_prueft_node_dns_vor_und_nach_dem_rollout(repo_root, run_cmd, inventory):
    res = run_cmd(["bash", str(repo_root / "scripts/devmesh/lan-dns-deploy.sh")])
    assert res.returncode == 0, res.output
    steps = [l.split(":", 1)[0] for l in res.stdout.splitlines() if ":" in l]
    # Positiv-Anker und Reihenfolge: Vorpruefung, Firewall, Labels, Apply, Rollout, Nachpruefung.
    order = ["pre-check", "firewall", "label", "apply", "rollout", "post-check"]
    first = [steps.index(s) for s in order]
    assert first == sorted(first), res.stdout
    # Node-DNS wird auf jedem k3s-Host geprueft, gelabelt nur Hosts mit lan_dns.
    pre = [l for l in res.stdout.splitlines() if l.startswith("pre-check:")]
    assert any("10.10.10.2" in l for l in pre) and any("10.10.10.3" in l for l in pre)
    labels = [l for l in res.stdout.splitlines() if l.startswith("label:")]
    assert any("srv-a" in l and "lan-dns=true" in l for l in labels), res.stdout
    assert any("srv-b" in l and "lan-dns-" in l for l in labels), res.stdout
    assert "rollback:" in res.stdout
