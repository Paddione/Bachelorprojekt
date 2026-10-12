"""devmesh/tailnet-policy.hujson spiegelt die Live-Policy des Tailnets [T900116, T016528].

Pruefmodus: die Policy-Datei ist Konfiguration, die per Admin-Konsole bzw. API
eingespielt wird; ihr Ergebnis manifestiert sich nur im Dateiinhalt (Ausnahme der
Output-Regel fuer Konfiguration). Geprueft werden die Invarianten, auf die
devmesh-Skripte und Runbooks bauen, und die Konsistenz mit devmesh/inventory.yaml.
"""

import json
import re

import pytest
import yaml


@pytest.fixture
def pol(repo_root):
    raw = (repo_root / "devmesh" / "tailnet-policy.hujson").read_text()
    lines = [l for l in raw.splitlines() if not l.lstrip().startswith("//")]
    policy = json.loads(re.sub(r",(\s*[}\]])", r"\1", "\n".join(lines)))
    inventory = yaml.safe_load((repo_root / "devmesh" / "inventory.yaml").read_text())
    return {"policy": policy, "inventory": inventory, "repo": repo_root}


def test_t016528_jeder_server_tag_aus_dem_inventar_ist_in_tagowners(pol):
    owners = pol["policy"]["tagOwners"]
    server_tags = {p["tag"] for p in pol["inventory"]["peers"] if p["role"] == "server"}
    # Positiv-Anker: das Inventar nennt Server-Tags.
    assert server_tags == {"tag:gpu-server"}, server_tags
    assert server_tags <= set(owners), f"Tags ohne Owner: {server_tags - set(owners)}"


def test_t016528_operator_darf_lan_dns_taggen(pol):
    owners = pol["policy"]["tagOwners"]
    assert "tag:k8s-operator" in owners
    assert "tag:k8s-operator" in owners["tag:lan-dns"]


def test_t016528_subnet_route_nur_fuer_devmesh_server_automatisch_freigegeben(pol):
    approvers = pol["policy"]["autoApprovers"]["routes"]
    assert approvers == {"10.0.0.0/24": ["tag:gpu-server"]}
    # Jeder Router mit subnet_routes im Inventar traegt den freigegebenen Tag.
    routers = [p for p in pol["inventory"]["peers"] if p.get("subnet_routes")]
    assert routers, "kein Peer mit subnet_routes"
    for p in routers:
        for route in p["subnet_routes"]:
            assert p["tag"] in approvers[route], (p["name"], route)


def test_t016528_dns_port_53_ist_fuer_das_tailnet_erreichbar(pol):
    policy = pol["policy"]
    allow_all = any(
        g.get("src") == ["*"] and g.get("dst") == ["*"] and g.get("ip") == ["*"]
        for g in policy.get("grants", [])
    )
    dns_rule = any("tag:lan-dns:53" in a.get("dst", []) for a in policy.get("acls", []))
    assert allow_all or dns_rule


def test_t900116_kein_tailscale_auth_key_in_versionierten_dateien(pol, run_cmd):
    prefix = "tskey"
    pattern = prefix + r"-(auth|api|client|scim|webhook)-[A-Za-z0-9]{6,}-[A-Za-z0-9]{16,}"
    # Positiv-Anker: das Muster erkennt einen zur Laufzeit gebauten synthetischen Key.
    fake = prefix + "-auth-kAbCdE1CNTRL-" + "x" * 24
    assert re.search(pattern, fake), "Muster erkennt synthetischen Key nicht"
    res = run_cmd(["git", "grep", "-lE", pattern, "--", ".", ":!environments/.secrets/"], cwd=pol["repo"])
    assert res.stdout.strip() == "", f"Auth-Key-Muster gefunden in: {res.stdout}"
