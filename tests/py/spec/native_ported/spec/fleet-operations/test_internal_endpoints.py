"""Native migration of tests/spec/fleet-operations/internal-endpoints.bats."""
from pathlib import Path

import pytest


def _read(root: Path, rel: str) -> str:
    return (root / rel).read_text(encoding="utf-8")


def test_bge_hosts_are_centrally_registered_schema_configmap_prod_overlay(repo_root):
    schema = _read(repo_root, "environments/schema.yaml")
    assert "name: BGE_EMBED_HOST" in schema
    assert "name: BGE_RERANK_HOST" in schema
    assert 'BGE_EMBED_HOST: "embed.localhost"' in _read(repo_root, "k3d/configmap-domains.yaml")
    fleet = _read(repo_root, "environments/fleet-korczewski.yaml")
    assert 'BGE_EMBED_HOST: "bge-embed.korczewski.de"' in fleet
    assert 'BGE_RERANK_HOST: "bge-rerank.korczewski.de"' in fleet
    # T016544: Prod-Patch ist entfallen (llm-gateway-Routen aus dem
    # Fleet-Overlay entfernt) — die Datei darf nicht mehr existieren.
    assert not (repo_root / "prod-fleet/korczewski/bge-hosts-patch.yaml").is_file(), \
        "bge-hosts-patch.yaml muss mit T016544 entfallen sein"


def test_bge_ingress_routes_are_wg_whitelisted_in_dev_and_prod(repo_root):
    # T016544: nur noch der Dev-Base (k3d) definiert Middleware+Routes; der
    # Prod-Patch ist mit den llm-gateway-Routen entfallen.
    f = "k3d/llm-gateway-ingress.yaml"
    file = repo_root / f
    assert file.is_file(), f"{f} fehlt"
    text = file.read_text(encoding="utf-8")
    assert "ipWhiteList" in text, f"{f} missing ipWhiteList"
    assert "192.168.100.0/24" in text, f"{f} missing wg CIDR"
    assert "llm-gateway-embed" in text, f"{f} missing embed ref"
    assert "llm-gateway-rerank" in text, f"{f} missing rerank ref"


def test_no_manifest_exposes_shared_db_5432_on_public_entrypoints_or_nodeport_lb(repo_root):
    # Die Policy-Datei dokumentiert nur die Verbote und wird bewusst ausgenommen.
    import re

    candidates = []
    for base in ("k3d", "prod-fleet"):
        for path in sorted((repo_root / base).rglob("*.yaml")):
            text = path.read_text(encoding="utf-8", errors="replace")
            if "shared-db" not in text:
                continue
            sp = str(path)
            if "shared-db-endpoint-policy.yaml" in sp or "/dev-stack/" in sp:
                continue
            if re.search(r"(type: (NodePort|LoadBalancer))|IngressRouteTCP", text):
                candidates.append(sp)
    assert not candidates, "public exposure candidates:\n" + "\n".join(candidates)


def test_endpoint_policy_configmap_documents_the_sish_transport_for_external_db_consumers(repo_root):
    f = repo_root / "k3d" / "shared-db-endpoint-policy.yaml"
    assert f.is_file()
    text = f.read_text(encoding="utf-8")
    assert "no-public-exposure" in text
    assert "sish" in text.lower()
