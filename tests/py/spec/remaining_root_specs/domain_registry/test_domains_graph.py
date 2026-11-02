"""Domains-Graph: SSO-Felder der Registry und offline-Generator (kein Netzwerk)."""
import subprocess
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[5]
REGISTRY = REPO / "docs/agent-guide/registry/domains.yaml"
GATES = {"native", "oauth2-proxy", "issuer"}


def _domains():
    return yaml.safe_load(REGISTRY.read_text())["domains"]


def test_every_oidc_host_declares_sso():
    for d in _domains():
        if d["auth"] == "oidc":
            sso = d.get("sso")
            assert sso, f"{d['id']}: auth oidc ohne sso-Block"
            assert sso["gate"] in GATES, f"{d['id']}: unbekanntes Gate {sso['gate']}"
            if sso["gate"] != "issuer":
                assert sso.get("client_id"), f"{d['id']}: client_id fehlt"


def test_graph_generator_offline_lists_all_hosts(tmp_path):
    out = REPO / "docs/agent-guide/maps/domains-graph.md"
    before = out.read_text() if out.exists() else None
    r = subprocess.run(["node", "scripts/domains-graph.mjs"], cwd=REPO, capture_output=True, text=True)
    try:
        assert r.returncode == 0, r.stderr
        text = out.read_text()
        assert text.count("\n## ") + text.startswith("## ") >= len(_domains())
        assert "manifest" in text.lower() and "Auth:" in text
    finally:
        if before is not None:
            out.write_text(before)
