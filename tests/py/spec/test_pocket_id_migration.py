"""Tests migrating tests/spec/pocket-id-migration.bats and tests/spec/pocket-id-proxy-ip.bats to pytest."""

import os
import re
import subprocess
from pathlib import Path
import pytest
import yaml


def _kustomize_build(path: Path) -> str:
    res = subprocess.run(
        ["kustomize", "build", str(path), "--load-restrictor=LoadRestrictionsNone"],
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"kustomize build {path} failed: {res.stderr}"
    return res.stdout


def _migrated_oauth2_manifests(k3d: Path) -> list[Path]:
    return [
        k3d / "oauth2-proxy-mailpit.yaml",
        k3d / "oauth2-proxy-traefik.yaml",
        k3d / "oauth2-proxy-comfy.yaml",
        k3d / "oauth2-proxy-brett.yaml",
        k3d / "oauth2-proxy-mediaviewer.yaml",
        k3d / "oauth2-proxy-videovault.yaml",
        k3d / "oauth2-proxy-studio.yaml",
        k3d / "oauth2-proxy-docs.yaml",
        k3d / "dev-stack" / "oauth2-proxy-brainstorm.yaml",
        k3d / "dev-stack" / "oauth2-proxy-sessions.yaml",
    ]


# ── Welle 0: Pocket ID manifest + Service + DB-init Job ─────────────────────

def test_pocket_id_welle_0_manifests_exist(repo_root: Path):
    k3d = repo_root / "k3d"
    prod = repo_root / "prod"

    assert (k3d / "pocket-id.yaml").is_file()
    assert (prod / "patch-pocket-id.yaml").is_file()

    assert re.search(r"^\s*-\s*pocket-id\.yaml", (k3d / "kustomization.yaml").read_text(), re.MULTILINE)
    assert re.search(r"^\s*-\s*path:\s*patch-pocket-id\.yaml", (prod / "kustomization.yaml").read_text(), re.MULTILINE)


def test_pocket_id_welle_0_kustomize_emits_resources(repo_root: Path):
    k3d = repo_root / "k3d"
    out = _kustomize_build(k3d)
    docs = list(yaml.safe_load_all(out))

    deployments = [d for d in docs if d and d.get("kind") == "Deployment" and d.get("metadata", {}).get("name") == "pocket-id"]
    assert len(deployments) == 1, "Deployment pocket-id must be emitted"

    services = [d for d in docs if d and d.get("kind") == "Service" and d.get("metadata", {}).get("name") == "pocket-id"]
    assert len(services) == 1, "Service pocket-id must be emitted"

    jobs = [d for d in docs if d and d.get("kind") == "Job" and d.get("metadata", {}).get("name") == "pocket-id-db-init"]
    assert len(jobs) == 1, "Job pocket-id-db-init must be emitted"


def test_pocket_id_welle_0_manifest_configurations(repo_root: Path):
    k3d = repo_root / "k3d"
    prod = repo_root / "prod"

    k3d_text = (k3d / "pocket-id.yaml").read_text()
    assert "${POCKET_ID_FRONTEND_URL}" in k3d_text
    assert "https://id.mentolder" not in k3d_text
    assert "https://auth.mentolder" not in k3d_text

    prod_text = (prod / "patch-pocket-id.yaml").read_text()
    assert "websecure" in prod_text
    assert "tls:" in prod_text
    assert "TLS_SECRET_NAME" in prod_text

    assert "pocket-id-data" in k3d_text
    assert "PersistentVolumeClaim" in k3d_text
    assert "claimName: pocket-id-data" in k3d_text


def test_pocket_id_welle_0_domain_config_and_schema(repo_root: Path):
    k3d = repo_root / "k3d"
    env_dir = repo_root / "environments"
    schema = env_dir / "schema.yaml"

    cm = (k3d / "configmap-domains.yaml").read_text()
    assert re.search(r'^\s*POCKET_ID_DOMAIN:\s*"auth\.localhost"', cm, re.MULTILINE)

    schema_text = schema.read_text()
    expected_secrets = [
        "POCKET_ID_API_KEY",
        "POCKET_ID_DB_PASSWORD",
        "POCKET_ID_MAIL_SECRET",
        "POCKET_ID_TRAEFIK_SECRET",
        "POCKET_ID_COMFY_SECRET",
        "POCKET_ID_MEDIAVIEWER_SECRET",
        "POCKET_ID_VIDEOVAULT_SECRET",
        "POCKET_ID_STUDIO_SECRET",
        "POCKET_ID_DOCS_SECRET",
        "POCKET_ID_VAULTWARDEN_SECRET",
        "POCKET_ID_RECOVERY_SECRET",
        "POCKET_ID_NEXTCLOUD_SECRET",
        "POCKET_ID_GRAFANA_SECRET",
        "POCKET_ID_WEBSITE_SECRET",
        "POCKET_ID_BRETT_SECRET",
        "POCKET_ID_BRAINSTORM_SECRET",
        "POCKET_ID_SESSION_HUB_SECRET",
    ]
    missing = [s for s in expected_secrets if not re.search(rf"^\s*-\s*name:\s*{s}\b", schema_text, re.MULTILINE)]
    assert not missing, f"missing from schema: {missing}"

    assert re.search(r"^\s*-\s*name:\s*POCKET_ID_FRONTEND_URL\b", schema_text, re.MULTILINE)
    assert re.search(r"^\s*-\s*name:\s*POCKET_ID_URL\b", schema_text, re.MULTILINE)

    dev_env = (env_dir / "dev.yaml").read_text()
    assert re.search(r"^\s*POCKET_ID_FRONTEND_URL:", dev_env, re.MULTILINE)
    assert re.search(r"^\s*POCKET_ID_URL:", dev_env, re.MULTILINE)

    mentolder_env = (env_dir / "mentolder.yaml").read_text()
    assert re.search(r'^\s*POCKET_ID_FRONTEND_URL:\s*"https://auth\.mentolder\.de"', mentolder_env, re.MULTILINE)
    assert re.search(r"^\s*POCKET_ID_URL:", mentolder_env, re.MULTILINE)

    korczewski_env = (env_dir / "korczewski.yaml").read_text()
    assert re.search(r'^\s*POCKET_ID_FRONTEND_URL:\s*"https://auth\.korczewski\.de"', korczewski_env, re.MULTILINE)
    assert re.search(r"^\s*POCKET_ID_URL:", korczewski_env, re.MULTILINE)

    fleet_m = (env_dir / "fleet-mentolder.yaml").read_text()
    assert re.search(r'^\s*POCKET_ID_FRONTEND_URL:\s*"https://auth\.mentolder\.de"', fleet_m, re.MULTILINE)

    fleet_k = (env_dir / "fleet-korczewski.yaml").read_text()
    assert re.search(r'^\s*POCKET_ID_FRONTEND_URL:\s*"https://auth\.korczewski\.de"', fleet_k, re.MULTILINE)


def test_pocket_id_workspace_deploy_task(repo_root: Path):
    taskfile = repo_root / "taskfiles" / "Taskfile.workspace.yml"
    text = taskfile.read_text()
    assert "POCKET_ID_DOMAIN" in text
    assert "POCKET_ID_FRONTEND_URL" in text
    assert "POCKET_ID_URL" in text


# ── Welle 1: oauth2-proxy services on Pocket ID ────────────────────────────

def test_pocket_id_welle_1_oauth2_proxies(repo_root: Path):
    k3d = repo_root / "k3d"
    prod = repo_root / "prod"

    for m in _migrated_oauth2_manifests(k3d):
        if not m.is_file():
            continue
        text = m.read_text()
        assert "keycloak-oidc" not in text, f"{m} still uses keycloak-oidc"
        assert re.search(r"POCKET_ID_[A-Z0-9_]+_SECRET", text), f"no POCKET_ID_*_SECRET in {m}"

        # check issuer URLs
        valid_issuer = (
            "pocket-id:1411" in text
            or "pocket-id.workspace.svc.cluster.local:1411" in text
            or "POCKET_ID_DOMAIN" in text
            or "auth.${PROD_DOMAIN}" in text
        )
        assert valid_issuer, f"missing pocket-id issuer in {m}"

    # specific rewires
    assert "POCKET_ID_MAIL_SECRET" in (k3d / "oauth2-proxy-mailpit.yaml").read_text()
    assert "MAIL_OIDC_SECRET" not in (k3d / "oauth2-proxy-mailpit.yaml").read_text()

    assert "POCKET_ID_TRAEFIK_SECRET" in (k3d / "oauth2-proxy-traefik.yaml").read_text()
    assert "TRAEFIK_OIDC_SECRET" not in (k3d / "oauth2-proxy-traefik.yaml").read_text()

    assert "POCKET_ID_COMFY_SECRET" in (k3d / "oauth2-proxy-comfy.yaml").read_text()
    assert "COMFY_OIDC_SECRET" not in (k3d / "oauth2-proxy-comfy.yaml").read_text()

    assert "POCKET_ID_BRETT_SECRET" in (k3d / "oauth2-proxy-brett.yaml").read_text()
    assert "BRETT_OIDC_SECRET" not in (k3d / "oauth2-proxy-brett.yaml").read_text()

    assert "POCKET_ID_MEDIAVIEWER_SECRET" in (k3d / "oauth2-proxy-mediaviewer.yaml").read_text()
    assert "MEDIAVIEWER_OIDC_CLIENT_SECRET" not in (k3d / "oauth2-proxy-mediaviewer.yaml").read_text()

    assert "POCKET_ID_VIDEOVAULT_SECRET" in (k3d / "oauth2-proxy-videovault.yaml").read_text()
    assert "VIDEOVAULT_OIDC_SECRET" not in (k3d / "oauth2-proxy-videovault.yaml").read_text()

    assert "POCKET_ID_STUDIO_SECRET" in (k3d / "oauth2-proxy-studio.yaml").read_text()
    assert "STUDIO_OIDC_SECRET" not in (k3d / "oauth2-proxy-studio.yaml").read_text()

    assert "POCKET_ID_BRAINSTORM_SECRET" in (k3d / "dev-stack" / "oauth2-proxy-brainstorm.yaml").read_text()
    assert "BRAINSTORM_OIDC_SECRET" not in (k3d / "dev-stack" / "oauth2-proxy-brainstorm.yaml").read_text()

    assert "POCKET_ID_SESSION_HUB_SECRET" in (k3d / "dev-stack" / "oauth2-proxy-sessions.yaml").read_text()
    assert "SESSION_HUB_OIDC_SECRET" not in (k3d / "dev-stack" / "oauth2-proxy-sessions.yaml").read_text()

    # vaultwarden and recovery browser
    vw_text = (k3d / "vaultwarden.yaml").read_text()
    assert "http://keycloak:8080/realms/workspace" not in vw_text
    assert "http://pocket-id:1411" in vw_text
    assert "POCKET_ID_VAULTWARDEN_SECRET" in vw_text
    assert "VAULTWARDEN_OIDC_SECRET" not in vw_text

    patch_vw = (prod / "patch-vaultwarden.yaml").read_text()
    assert "SSO_AUTHORITY" in patch_vw
    assert 'value: "https://auth.${PROD_DOMAIN}"' in patch_vw
    assert "auth.${PROD_DOMAIN}/realms/workspace" not in patch_vw

    rec_text = (k3d / "recovery-browser.yaml").read_text()
    assert "POCKET_ID_DOMAIN" in rec_text
    assert "POCKET_ID_RECOVERY_SECRET" in rec_text
    assert "${KC_DOMAIN}/realms/workspace" not in rec_text

    # prod oauth2 patches
    for p in prod.glob("patch-oauth2-proxy-*.yaml"):
        p_text = p.read_text()
        assert re.search(r"POCKET_ID_[A-Z0-9_]+_SECRET", p_text), f"no POCKET_ID_*_SECRET in {p}"
        assert "oidc-issuer-url=https://auth.${PROD_DOMAIN}" in p_text, f"{p} still has old issuer URL"


# ── Welle 2: website identity.ts + auth.ts + 27 import sites ───────────────

def test_pocket_id_welle_2_website_identity(repo_root: Path):
    website = repo_root / "components" / "website"
    identity_file = website / "src" / "lib" / "identity.ts"
    assert identity_file.is_file()

    text = identity_file.read_text()
    expected_exports = [
        "createUser", "setUserPassword", "sendPasswordResetEmail",
        "listUsers", "getUserById", "deleteUser", "updateUser",
        "updateUserAttribute", "listRealmRoles", "getUserRealmRoles",
        "assignRealmRole", "removeRealmRole",
        "listGroups", "assignUserToGroups",
    ]
    for sym in expected_exports:
        assert re.search(rf"export (async function|function|interface|const|let) {sym}\b", text), f"missing export: {sym}"

    assert "X-API-KEY" in text
    assert "POCKET_ID_API_KEY" in text
    assert not re.search(r"^\s*'Authorization'\s*:", text, re.MULTILINE)


def test_pocket_id_welle_2_auth_and_imports(repo_root: Path):
    website = repo_root / "components" / "website"
    k3d = repo_root / "k3d"
    prod = repo_root / "prod"

    auth_ts = (website / "src" / "lib" / "auth.ts").read_text()
    assert "KEYCLOAK_URL" not in auth_ts
    assert "KEYCLOAK_REALM" not in auth_ts
    assert "realms/workspace" not in auth_ts
    assert "isAdmin" in auth_ts

    provider_ts = (website / "src" / "lib" / "auth" / "provider.ts").read_text()
    assert "POCKET_ID_URL" in provider_ts
    assert "POCKET_ID_FRONTEND_URL" in provider_ts

    # Check that no files import lib/keycloak (except keycloak.ts itself if it existed)
    bad_imports = []
    for f in (website / "src").rglob("*.ts*"):
        if f.name == "keycloak.ts":
            continue
        try:
            content = f.read_text()
            if re.search(r"from\s+['\"][^'\"]*lib/keycloak['\"]", content):
                bad_imports.append(str(f))
        except Exception:
            pass
    assert not bad_imports, f"files still importing lib/keycloak: {bad_imports}"

    website_yaml = (k3d / "website.yaml").read_text()
    assert "POCKET_ID_FRONTEND_URL" in website_yaml
    assert "POCKET_ID_URL" in website_yaml
    assert "POCKET_ID_API_KEY" in website_yaml
    assert "POCKET_ID_WEBSITE_SECRET" in website_yaml

    # Nextcloud
    nc_dev = (k3d / "nextcloud-oidc-dev.php").read_text()
    assert "'oidc_login_provider_url'" in nc_dev and "http://pocket-id:1411" in nc_dev
    assert "POCKET_ID_NEXTCLOUD_SECRET" in nc_dev

    nc_prod = (prod / "nextcloud-oidc-prod.php").read_text()
    assert "POCKET_ID_NEXTCLOUD_SECRET" in nc_prod
    assert "POCKET_ID_DOMAIN" in nc_prod
    assert "keycloak:8080/realms/workspace" not in nc_prod
    assert "KC_DOMAIN" not in nc_prod

    # Grafana
    grafana_patch = (prod / "monitoring" / "grafana-oidc-patch.yaml").read_text()
    assert "https://auth.${PROD_DOMAIN}/authorize" in grafana_patch
    assert "https://auth.${PROD_DOMAIN}/api/oidc/token" in grafana_patch
    assert "https://auth.${PROD_DOMAIN}/api/oidc/userinfo" in grafana_patch
    assert "POCKET_ID_GRAFANA_SECRET" in grafana_patch
    assert not re.search(r"GF_AUTH_GENERIC_OAUTH_AUTH_URL.*auth\.mentolder", grafana_patch)

    grafana_secret = (k3d / "monitoring" / "grafana-oidc-secret.yaml").read_text()
    assert "POCKET_ID_GRAFANA_SECRET" in grafana_secret

    # Brett
    brett_auth = (repo_root / "components" / "brett" / "src" / "server" / "auth.ts").read_text()
    assert "keycloak" not in brett_auth
    assert "POCKET_ID_URL" in brett_auth
    if "isAdminFromClaims" in brett_auth:
        assert "isAdmin" in brett_auth

    # E2E specs
    fa_15 = repo_root / "tests" / "e2e" / "specs" / "fa-15-oidc.spec.ts"
    if fa_15.is_file():
        assert "openid-connect/auth" not in fa_15.read_text()

    sa_02 = repo_root / "tests" / "e2e" / "specs" / "sa-02-auth.spec.ts"
    if sa_02.is_file():
        assert "realms/workspace" not in sa_02.read_text()


def test_pocket_id_welle_3_observation_skipped():
    pytest.skip("Welle 3 is gated on a 14+7 day production observation window.")


def test_pocket_id_kustomize_build_sanity(repo_root: Path):
    out_k3d = _kustomize_build(repo_root / "k3d")
    assert out_k3d
    out_prod = _kustomize_build(repo_root / "prod")
    assert out_prod


def test_pocket_id_wiring_and_secrets(repo_root: Path):
    k3d = repo_root / "k3d"
    schema = repo_root / "environments" / "schema.yaml"
    website = repo_root / "components" / "website"

    assert re.search(r"^\s*-\s*pocket-id-client-seed\.yaml", (k3d / "kustomization.yaml").read_text(), re.MULTILINE)

    secrets_text = (k3d / "secrets.yaml").read_text()
    expected_k3d_keys = [
        "POCKET_ID_DB_PASSWORD", "POCKET_ID_API_KEY",
        "POCKET_ID_DOCS_SECRET", "POCKET_ID_MAIL_SECRET", "POCKET_ID_BRETT_SECRET",
        "POCKET_ID_COMFY_SECRET", "POCKET_ID_MEDIAVIEWER_SECRET", "POCKET_ID_VIDEOVAULT_SECRET",
        "POCKET_ID_STUDIO_SECRET", "POCKET_ID_TRAEFIK_SECRET", "POCKET_ID_RECOVERY_SECRET",
        "POCKET_ID_VAULTWARDEN_SECRET", "POCKET_ID_CLAUDE_CODE_SECRET",
        "POCKET_ID_SESSION_HUB_SECRET", "POCKET_ID_BRAINSTORM_SECRET", "POCKET_ID_NEXTCLOUD_SECRET",
    ]
    missing = [k for k in expected_k3d_keys if not re.search(rf"^\s*{k}:", secrets_text, re.MULTILINE)]
    assert not missing, f"missing from k3d/secrets.yaml: {missing}"

    web_secrets = (k3d / "website-dev-secrets.yaml").read_text()
    assert re.search(r"^\s*POCKET_ID_WEBSITE_SECRET:", web_secrets, re.MULTILINE)
    assert re.search(r"^\s*POCKET_ID_API_KEY:", web_secrets, re.MULTILINE)

    env_d_ts = (website / "src" / "env.d.ts").read_text()
    assert re.search(r"^\s*readonly POCKET_ID_WEBSITE_SECRET:\s*string", env_d_ts, re.MULTILINE)

    brett_yaml = (k3d / "brett.yaml").read_text()
    assert re.search(r'^\s*value:\s*"brett"\s*$', brett_yaml, re.MULTILINE)
    assert not re.search(r'^\s*value:\s*"brett-app"\s*$', brett_yaml, re.MULTILINE)

    schema_text = schema.read_text()
    assert re.search(r"^\s*-\s*name:\s*POCKET_ID_NEXTCLOUD_SECRET\b", schema_text, re.MULTILINE)

    out = _kustomize_build(k3d)
    docs = list(yaml.safe_load_all(out))
    seed_job = [d for d in docs if d and d.get("kind") == "Job" and d.get("metadata", {}).get("name") == "pocket-id-client-seed"]
    assert len(seed_job) == 1, "k3d build must emit pocket-id-client-seed Job"


# ── Proxy IP tests ──────────────────────────────────────────────────────────

def test_pocket_id_proxy_ip_no_forwarded_headers(repo_root: Path):
    k3d = repo_root / "k3d"
    text = (k3d / "pocket-id.yaml").read_text()
    assert "forwardedHeaders" not in text
    assert "TRUST_PROXY" in text

    out = _kustomize_build(k3d)
    docs = list(yaml.safe_load_all(out))
    for doc in docs:
        if doc and doc.get("kind") == "IngressRoute":
            assert "forwardedHeaders" not in doc.get("spec", {}), (
                f"IngressRoute {doc.get('metadata', {}).get('name')} must not have forwardedHeaders"
            )
