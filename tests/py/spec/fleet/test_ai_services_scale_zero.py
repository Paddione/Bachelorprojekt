"""Offline contract: AI services remain activatable while idle pods stay absent."""

import os
import shutil
import subprocess

import pytest
import yaml


AI_DEPLOYMENTS = {
    "whisper", "talk-transcriber", "talk-recording",
    "bge-embed", "bge-embed-bulk", "bge-rerank",
}
AI_SERVICES = {
    "whisper", "talk-transcriber", "talk-recording",
    "llm-gateway-embed", "llm-gateway-rerank",
}


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
    return render(repo_root / "prod-fleet/mentolder")


def test_ai_deployments_exist_with_zero_replicas(fleet_resources):
    for name in sorted(AI_DEPLOYMENTS):
        deployment = fleet_resources.get(("Deployment", name))
        assert deployment is not None, f"{name}: removed instead of dormant"
        assert deployment["spec"]["replicas"] == 0, name


def test_dormant_services_retain_internal_dependencies(fleet_resources):
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
        expected = {"bge-embed", "bge-embed-bulk"} if name == "llm-gateway-embed" else {
            "bge-rerank" if name == "llm-gateway-rerank" else name
        }
        assert matches == expected, f"{name}: selector targets {matches}"
    for name in ("bge-embed-models", "bge-rerank-models"):
        assert ("PersistentVolumeClaim", name) in fleet_resources
    for name in (
        "allow-llm-gateway-egress", "allow-transcriber-to-website-egress",
        "allow-website-to-bge-embed-ingress", "allow-website-to-bge-rerank-ingress",
    ):
        assert ("NetworkPolicy", name) in fleet_resources
    for name in ("llm-gateway-embed", "llm-gateway-rerank"):
        assert ("IngressRoute", name) not in fleet_resources


def test_gitops_override_can_activate_all_ai_deployments(repo_root, tmp_path):
    (tmp_path / "kustomization.yaml").write_text(yaml.safe_dump({
        "apiVersion": "kustomize.config.k8s.io/v1beta1",
        "kind": "Kustomization",
        "resources": [os.path.relpath(repo_root / "prod-fleet/mentolder", tmp_path)],
        "replicas": [{"name": name, "count": 1} for name in sorted(AI_DEPLOYMENTS)],
    }))
    activated = render(tmp_path)
    for name in sorted(AI_DEPLOYMENTS):
        assert activated.get(("Deployment", name), {}).get("spec", {}).get("replicas") == 1, name


def test_base_keeps_existing_ai_replica_defaults(repo_root):
    base = render(repo_root / "prod-mentolder")
    for name in AI_DEPLOYMENTS - {"bge-embed-bulk"}:
        assert base[("Deployment", name)]["spec"]["replicas"] == 1, name
    assert base[("Deployment", "bge-embed-bulk")]["spec"]["replicas"] == 0
