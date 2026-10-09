"""Regression: Fleet Dev-Brett needs isolated OIDC and session configuration."""
import yaml


def test_dev_brett_has_isolated_oidc_client_and_session_secret(repo_root):
    documents = yaml.safe_load_all((repo_root / "k3d/dev-stack/brett-dev.yaml").read_text())
    deployment = next(doc for doc in documents if doc["kind"] == "Deployment")
    container = deployment["spec"]["template"]["spec"]["containers"][0]
    env = {entry["name"]: entry for entry in container["env"]}
    assert "BRETT_CLIENT_ID" in env, "Dev-Brett has no OIDC client configuration"
    assert env["BRETT_CLIENT_ID"]["value"] == "brett-dev"
    assert env["POCKET_ID_URL"]["value"] == "http://pocket-id.workspace.svc.cluster.local:1411"
    assert env["POCKET_ID_PUBLIC_URL"]["value"] == "https://auth.${PROD_DOMAIN}"
    assert env["BRETT_PUBLIC_URL"]["value"] == "https://${DEV_BRETT_HOST}"
    assert env["POCKET_ID_BRETT_SECRET"]["valueFrom"]["secretKeyRef"] == {
        "name": "dev-oidc-secrets", "key": "POCKET_ID_BRETT_DEV_SECRET"
    }
    assert env["BRETT_SESSION_SECRET"]["valueFrom"]["secretKeyRef"] == {
        "name": "dev-oidc-secrets", "key": "BRETT_SESSION_SECRET"
    }
