"""Offline contract: Talk-KI-Dienste sind im korczewski-Fleet-Overlay vorhanden
und korrekt verdrahtet.

brand-trennung p8: prod-fleet/mentolder ist geloescht (korczewski-only Repo).
Anders als das alte mentolder-Overlay (scale-zero: replicas 0, bge nur auf
devmesh — siehe docs/runbooks/ai-services-scale-zero.md) faehrt korczewski
die Talk-Dienste AKTIV (replicas 1) und enthaelt den bge-Stapel. Die
Belegung steht im p8-Commit (Render-Evidenz); nichts erfunden.
"""

import os
import shutil
import subprocess

import pytest
import yaml


AI_DEPLOYMENTS = {"whisper", "talk-transcriber", "talk-recording"}
AI_SERVICES = set(AI_DEPLOYMENTS)
BGE_DEPLOYMENTS = {"bge-embed", "bge-embed-bulk", "bge-rerank"}


class ManifestLoader(yaml.SafeLoader):
    pass


ManifestLoader.add_constructor(
    "tag:yaml.org,2002:value", lambda loader, node: loader.construct_scalar(node)
)


def render(path):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl binary not installed")
    result = subprocess.run(
        ["kubectl", "kustomize", str(path), "--load-restrictor=LoadRestrictionsNone"],
        capture_output=True, text=True, timeout=90,
    )
    assert result.returncode == 0, result.stderr
    return {
        (doc["kind"], doc["metadata"]["name"]): doc
        for doc in yaml.load_all(result.stdout, Loader=ManifestLoader)
        if isinstance(doc, dict) and "kind" in doc
    }


@pytest.fixture(scope="module")
def fleet_resources(repo_root):
    return render(repo_root / "prod-fleet/korczewski")


def test_ai_deployments_exist_active(fleet_resources):
    # korczewski faehrt die Talk-Dienste aktiv (kein scale-zero wie mentolder).
    for name in sorted(AI_DEPLOYMENTS):
        deployment = fleet_resources.get(("Deployment", name))
        assert deployment is not None, f"{name}: missing from korczewski overlay"
        assert deployment["spec"]["replicas"] == 1, name


def test_active_services_retain_internal_dependencies(fleet_resources):
    for name in AI_SERVICES:
        service = fleet_resources.get(("Service", name))
        assert service is not None, f"missing Service {name}"
        assert service["spec"].get("type", "ClusterIP") == "ClusterIP"
        selector = service["spec"].get("selector", {})
        assert selector, f"{name}: missing selector"
        matches = {
            deployment_name for deployment_name in AI_DEPLOYMENTS
            if selector.items() <= fleet_resources[("Deployment", deployment_name)]["spec"]
            ["template"]["metadata"]["labels"].items()
        }
        assert matches == {name}, f"{name}: selector targets {matches}"
    assert ("NetworkPolicy", "allow-transcriber-to-website-egress") in fleet_resources


def test_bge_present_in_korczewski(fleet_resources):
    # Gegenstueck zum alten mentolder-Negativ-Anker: korczewski enthaelt den
    # bge-Stapel (Render-Evidenz im p8-Commit). Positiv-Anker: Talk-Dienste
    # sind im selben Build vorhanden.
    assert ("Deployment", "whisper") in fleet_resources
    expected = [("Deployment", n) for n in sorted(BGE_DEPLOYMENTS)] + [
        ("Service", "llm-gateway-embed"), ("Service", "llm-gateway-rerank"),
        ("IngressRoute", "llm-gateway-embed"), ("IngressRoute", "llm-gateway-rerank"),
        ("PersistentVolumeClaim", "bge-embed-models"),
        ("PersistentVolumeClaim", "bge-rerank-models"),
        ("NetworkPolicy", "allow-llm-gateway-egress"),
        ("NetworkPolicy", "allow-website-to-bge-embed-ingress"),
        ("NetworkPolicy", "allow-website-to-bge-rerank-ingress"),
    ]
    missing = [key for key in expected if key not in fleet_resources]
    assert not missing, f"bge-Ressourcen fehlen im korczewski-Build: {missing}"


def test_gitops_override_can_activate_all_ai_deployments(repo_root, tmp_path):
    (tmp_path / "kustomization.yaml").write_text(yaml.safe_dump({
        "apiVersion": "kustomize.config.k8s.io/v1beta1",
        "kind": "Kustomization",
        "resources": [os.path.relpath(repo_root / "prod-fleet/korczewski", tmp_path)],
        "replicas": [{"name": name, "count": 1} for name in sorted(AI_DEPLOYMENTS)],
    }))
    activated = render(tmp_path)
    for name in sorted(AI_DEPLOYMENTS):
        assert activated.get(("Deployment", name), {}).get("spec", {}).get("replicas") == 1, name


def test_base_keeps_existing_ai_replica_defaults(repo_root):
    base = render(repo_root / "prod-mentolder")
    for name in (AI_DEPLOYMENTS | BGE_DEPLOYMENTS) - {"bge-embed-bulk"}:
        assert base[("Deployment", name)]["spec"]["replicas"] == 1, name
    assert base[("Deployment", "bge-embed-bulk")]["spec"]["replicas"] == 0
