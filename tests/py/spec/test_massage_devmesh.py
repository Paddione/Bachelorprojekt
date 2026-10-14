"""Verify the rendered Massage dev deployment, including Kubernetes env ordering."""
import subprocess

import yaml


def test_massage_devmesh_runtime_configuration(repo_root):
    result = subprocess.run(
        ["bash", "scripts/devmesh/render-stack.sh", "core"], cwd=repo_root,
        capture_output=True, text=True, check=True,
    )
    docs = {(d["kind"], d["metadata"]["name"]): d
            for d in yaml.safe_load_all(result.stdout) if d}
    config = docs["ConfigMap", "website-config"]["data"]
    assert all(isinstance(value, str) for value in config.values())
    assert config["BRAND"] == config["BRAND_ID"] == "massage"
    assert config["SITE_URL"] == "https://massage.devmesh.korczewski.de"
    deployment = docs["Deployment", "website"]
    assert deployment["metadata"]["namespace"] == "workspace"
    pod = deployment["spec"]["template"]
    assert len(pod["metadata"]["annotations"]["checksum/config"]) == 64
    env = pod["spec"]["containers"][0]["env"]
    assert all(isinstance(entry["value"], str) for entry in env if "value" in entry)
    names = [entry["name"] for entry in env]
    assert names.index("WEBSITE_DB_PASSWORD") < names.index("SESSIONS_DATABASE_URL")
    assert next(e["value"] for e in env if e["name"] == "SESSIONS_DATABASE_URL") == (
        "postgresql://website:$(WEBSITE_DB_PASSWORD)@"
        "massage-db-dev.workspace.svc.cluster.local:5432/website"
    )
    assert docs["Service", "massage-db-dev"]["spec"]["selector"] == {"app": "massage-db-dev"}
    assert "'massage'" in docs["ConfigMap", "massage-brand-seed"]["data"]["seed.sql"]
    seed = docs["Job", "pocket-id-client-seed"]["spec"]["template"]["spec"]["containers"][0]
    assert next(e["value"] for e in seed["env"] if e["name"] == "WEBSITE_EXTRA_CALLBACK") == (
        "https://massage.devmesh.korczewski.de/api/auth/callback"
    )
    assert "web.${SUFFIX}/api/auth/callback" in seed["command"][-1]
    assert "${WEBSITE_EXTRA_CALLBACK}" in seed["command"][-1]
