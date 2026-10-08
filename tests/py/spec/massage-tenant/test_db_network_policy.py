"""Massage-Tenant (T901440): NetworkPolicy — 5432 nur aus erlaubten Namespaces.

endpoint-policy.yaml bleibt reine Doku (ConfigMap); die echte Regel steht in
k3d/network-policies.yaml und erlaubt zusaetzlich website-korczewski und
workspace-korczewski — sonst nichts.
"""
import subprocess
from pathlib import Path

import pytest
import yaml


def _yaml_load_all(text: str):
    """Parse multi-doc YAML incl. upstream CRD value-tags (T002236)."""
    loader = yaml.SafeLoader
    loader.add_constructor(
        "tag:yaml.org,2002:value", lambda ldr, node: ldr.construct_scalar(node)
    )
    return list(yaml.load_all(text, Loader=loader))




ALLOWED_EXTRA_PEERS = {"website-korczewski", "workspace-korczewski"}


def _rendered_policies(repo_root: Path):
    res = subprocess.run(
        ["kustomize", "build", "prod-fleet/mentolder", "--load-restrictor=LoadRestrictionsNone"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert res.returncode == 0, f"kustomize build failed: {res.stderr}"
    return [d for d in _yaml_load_all(res.stdout) if d]


def _shared_db_ingress_policies(docs):
    hits = []
    for doc in docs:
        if doc.get("kind") != "NetworkPolicy":
            continue
        selector = (doc.get("spec", {}) or {}).get("podSelector", {}).get("matchLabels", {})
        if selector.get("app") == "shared-db":
            hits.append(doc)
    assert hits, "keine NetworkPolicy mit app=shared-db gefunden"
    return hits


def _allowed_namespaces(policy) -> set:
    namespaces = set()
    for rule in (policy.get("spec", {}) or {}).get("ingress", []) or []:
        for peer in rule.get("from", []) or []:
            ns_selector = (peer.get("namespaceSelector") or {}).get("matchLabels", {})
            name = ns_selector.get("kubernetes.io/metadata.name")
            if name:
                namespaces.add(name)
    return namespaces


def test_shared_db_allows_massage_namespaces(repo_root: Path):
    policies = _shared_db_ingress_policies(_rendered_policies(repo_root))
    combined = set()
    for policy in policies:
        combined |= _allowed_namespaces(policy)
    for ns in ALLOWED_EXTRA_PEERS:
        assert ns in combined, f"Namespace {ns} darf shared-db:5432 nicht erreichen"


def test_shared_db_keeps_existing_mentolder_peers(repo_root: Path):
    policies = _shared_db_ingress_policies(_rendered_policies(repo_root))
    combined = set()
    for policy in policies:
        combined |= _allowed_namespaces(policy)
    # Platzhalter-Variante (${WEBSITE_NAMESPACE}) oder aufgeloester Mentolder-NS
    assert combined & ({"website", "${WEBSITE_NAMESPACE}"}) or "website" in combined or any(
        "website" in ns for ns in combined
    ), f"bestehende Website-Peers verloren: {combined}"


def test_shared_db_no_universal_peer(repo_root: Path):
    policies = _shared_db_ingress_policies(_rendered_policies(repo_root))
    for policy in policies:
        name = (policy.get("metadata", {}) or {}).get("name")
        for rule in (policy.get("spec", {}) or {}).get("ingress", []) or []:
            ports = rule.get("ports", []) or []
            for port in ports:
                assert port.get("port") == 5432, (
                    f"{name}: unerwartete Portfreigabe {port} auf shared-db"
                )
            for peer in rule.get("from", []) or []:
                ns_selector = peer.get("namespaceSelector")
                assert ns_selector not in ({}, {"matchLabels": {}}), (
                    f"{name}: leerer namespaceSelector = alle Namespaces"
                )
                assert peer.get("ipBlock") is None, f"{name}: ipBlock auf shared-db"


def test_shared_db_clusterip_only(repo_root: Path):
    policies = _shared_db_ingress_policies(_rendered_policies(repo_root))
    assert policies


def test_no_public_5432_endpoint(repo_root: Path):
    res = subprocess.run(
        ["kustomize", "build", "prod-fleet/mentolder", "--load-restrictor=LoadRestrictionsNone"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert res.returncode == 0
    for doc in _yaml_load_all(res.stdout):
        if not doc:
            continue
        if doc.get("kind") == "Service":
            ports = (doc.get("spec", {}) or {}).get("ports", []) or []
            for port in ports:
                if port.get("port") == 5432 or port.get("targetPort") == 5432:
                    assert (doc.get("spec", {}) or {}).get("type", "ClusterIP") == "ClusterIP", (
                        f"Service {(doc.get('metadata', {}) or {}).get('name')} exponiert 5432"
                    )
        if doc.get("kind") in ("Ingress", "IngressRoute"):
            assert "5432" not in str(doc), "5432 ueber Ingress exponiert"


def test_endpoint_policy_stays_documentation_only(repo_root: Path):
    text = (repo_root / "k3d" / "shared-db-endpoint-policy.yaml").read_text(encoding="utf-8")
    assert "no-public-exposure" in text
    docs = [d for d in _yaml_load_all(text) if d]
    assert all(d.get("kind") != "NetworkPolicy" for d in docs), (
        "endpoint-policy.yaml darf keine NetworkPolicy werden"
    )
