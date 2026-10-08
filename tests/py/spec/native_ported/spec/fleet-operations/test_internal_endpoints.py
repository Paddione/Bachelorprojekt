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
    fleet = _read(repo_root, "environments/fleet-mentolder.yaml")
    assert 'BGE_EMBED_HOST: "bge-embed.mentolder.de"' in fleet
    assert 'BGE_RERANK_HOST: "bge-rerank.mentolder.de"' in fleet
    patch = _read(repo_root, "prod-fleet/mentolder/bge-hosts-patch.yaml")
    assert "bge-embed.mentolder.de" in patch
    assert "bge-rerank.mentolder.de" in patch


def test_bge_ingress_routes_are_wg_whitelisted_in_dev_and_prod(repo_root):
    # Base (k3d) definiert Middleware+Routes; Prod-Patch tauscht nur die Hosts.
    for f in ("k3d/llm-gateway-ingress.yaml", "prod-fleet/mentolder/bge-hosts-patch.yaml"):
        file = repo_root / f
        assert file.is_file(), f"{f} fehlt"
        text = file.read_text(encoding="utf-8")
        if f == "prod-fleet/mentolder/bge-hosts-patch.yaml":
            # Middleware 'wg-only' wird einmalig im k3d-Base definiert und hier nur referenziert.
            assert "name: wg-only" in text, f"{f} missing wg-only ref"
        else:
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
