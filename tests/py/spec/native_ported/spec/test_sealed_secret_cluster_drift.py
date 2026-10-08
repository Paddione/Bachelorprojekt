"""Native migration of tests/spec/sealed-secret-cluster-drift.bats."""

import json
import shutil
from pathlib import Path

import pytest
import yaml


def required_website_secret_keys(path: Path) -> list:
    """secretKeyRef.key values for name == website-secrets in all container env entries."""
    keys = set()
    with path.open(encoding="utf-8") as fh:
        for doc in yaml.safe_load_all(fh):
            if not doc:
                continue
            tpl = (doc.get("spec") or {}).get("template") or {}
            for c in (tpl.get("spec") or {}).get("containers") or []:
                for e in c.get("env") or []:
                    ref = (e.get("valueFrom") or {}).get("secretKeyRef") or {}
                    if ref.get("name") == "website-secrets" and ref.get("key"):
                        keys.add(ref["key"])
    return sorted(keys)


def cluster_secret_keys(run_cmd, ns: str, name: str) -> list:
    if shutil.which("kubectl") is None:
        return []
    try:
        result = run_cmd(["kubectl", "get", "secret", name, "-n", ns, "-o", "jsonpath={.data}"])
    except FileNotFoundError:
        return []
    raw = result.stdout.strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return sorted(data.keys())


def _brand_or_skip(run_cmd, brand: str) -> None:
    if shutil.which("kubectl") is None or run_cmd(["kubectl", "get", "nodes", "--request-timeout=3s"]).returncode != 0:
        pytest.skip("no live cluster reachable (kubectl get nodes failed)")
    if run_cmd(["kubectl", "get", "ns", f"website-{brand}"]).returncode != 0:
        pytest.skip(f"namespace website-{brand} not present in active cluster (brand not deployed)")


def _check_brand(run_cmd, repo_root: Path, brand: str) -> None:
    _brand_or_skip(run_cmd, brand)
    required_file = repo_root / "k3d" / "website.yaml"
    if not required_file.is_file():
        pytest.skip("k3d/website.yaml not found (repo layout unexpected)")

    live = set(cluster_secret_keys(run_cmd, f"website-{brand}", "website-secrets"))
    missing = [k for k in required_website_secret_keys(required_file) if k not in live]
    assert not missing, (
        f"Website Deployment requires these env-from-secret keys (k3d/website.yaml) but the cluster Secret "
        f"website-{brand}/website-secrets is missing them: {missing}"
    )


def test_mentolder_cluster_website_secrets_has_every_key_the_website_deployment_requires(repo_root, run_cmd):
    """mentolder: cluster website-secrets has every key the website Deployment requires"""
    _check_brand(run_cmd, repo_root, "mentolder")


def test_korczewski_cluster_website_secrets_has_every_key_the_website_deployment_requires(repo_root, run_cmd):
    """korczewski: cluster website-secrets has every key the website Deployment requires"""
    _check_brand(run_cmd, repo_root, "korczewski")
