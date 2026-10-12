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


def test_deployment_zwei_replicas_auf_verschiedenen_nodes(rendered):
    dep = _one(rendered, "Deployment", "adguard")
    spec = dep["spec"]["template"]["spec"]
    assert dep["metadata"]["namespace"] == "lan-dns"
    assert dep["spec"]["replicas"] == 2
    terms = spec["affinity"]["podAntiAffinity"]["requiredDuringSchedulingIgnoredDuringExecution"]
    assert any(t["topologyKey"] == "kubernetes.io/hostname" for t in terms)
    image = spec["containers"][0]["image"]
    assert re.fullmatch(r"adguard/adguardhome:v\d+\.\d+\.\d+", image), image
    assert spec["dnsPolicy"] == "None"
    assert _one(rendered, "PodDisruptionBudget", "adguard")["spec"]["minAvailable"] == 1


def test_dns_service_loadbalancer_udp_tcp_53_und_im_tailnet(rendered):
    svc = _one(rendered, "Service", "adguard-dns")
    assert svc["spec"]["type"] == "LoadBalancer"
    ports = {(p["port"], p["protocol"]) for p in svc["spec"]["ports"]}
    assert {(53, "UDP"), (53, "TCP")} <= ports
    ann = svc["metadata"]["annotations"]
    assert ann["tailscale.com/expose"] == "true"
    assert ann["tailscale.com/hostname"] == "lan-dns"
    assert ann["tailscale.com/tags"] == "tag:lan-dns"


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
        " subnet_routes: [10.0.0.0/24]}\n"
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


def test_task_dns_deploy_setzt_firewall_vor_dem_apply(repo_root, run_cmd, tmp_path):
    if shutil.which("task") is None or shutil.which("kubectl") is None:
        pytest.skip("task or kubectl binary not installed")
    # Hermetisch: die Precondition verlangt einen Context devmesh, CI hat keinen.
    kubeconfig = tmp_path / "kubeconfig"
    kubeconfig.write_text(
        "apiVersion: v1\nkind: Config\n"
        "clusters: [{name: devmesh, cluster: {server: 'https://127.0.0.1:6443'}}]\n"
        "users: [{name: devmesh, user: {}}]\n"
        "contexts: [{name: devmesh, context: {cluster: devmesh, user: devmesh}}]\n"
    )
    import os
    env = {**os.environ, "KUBECONFIG": str(kubeconfig)}
    res = run_cmd(["task", "--dry", "devmesh:dns:deploy"], cwd=repo_root, env=env)
    assert res.returncode == 0, res.output
    out = res.output
    assert "lan-dns-firewall.sh" in out and "apply -k dev-local/lan-dns" in out
    assert out.index("lan-dns-firewall.sh") < out.index("apply -k dev-local/lan-dns")
