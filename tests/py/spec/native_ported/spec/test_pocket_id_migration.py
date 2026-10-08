"""Native migration of tests/spec/pocket-id-migration.bats.

Verifies that the Pocket ID migration (Welle 0 + 1 + 2) is wired into manifests,
env, schema and code. Welle 3 (Keycloak shutdown) stays skipped behind its
observation gate. Mostly configuration-surface guards (T002448-M4 exception).
"""
import re
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest

LOAD = "--load-restrictor=LoadRestrictionsNone"


@pytest.fixture
def P(repo_root):
    return SimpleNamespace(
        repo=repo_root,
        k3d=repo_root / "k3d",
        prod=repo_root / "prod",
        env=repo_root / "environments",
        website=repo_root / "components" / "website",
        brett=repo_root / "components" / "brett",
        schema=repo_root / "environments" / "schema.yaml",
    )


def _read(path):
    return path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""


def _has(path, pattern):
    """grep -qE: any line of path matches the regex."""
    rx = re.compile(pattern)
    return any(rx.search(line) for line in _read(path).splitlines())


def _lit(path, text):
    """grep -q with a literal needle (single line)."""
    return text in _read(path)


def _kustomize(run_cmd, directory):
    if shutil.which("kustomize") is None:
        pytest.skip("kustomize required")
    r = run_cmd(["kustomize", "build", str(directory), LOAD], timeout=300)
    r.check(0)
    return r.stdout


def _awk_kind_name(output, kind, name):
    """Port of the awk one-liner: a document terminated by '---' with kind and name."""
    prev_kind = ""
    matched = False
    for line in output.splitlines():
        if line == "---":
            if prev_kind == kind and matched:
                return True
            prev_kind = ""
            matched = False
            continue
        if line.startswith("kind: "):
            parts = line.split()
            prev_kind = parts[1] if len(parts) > 1 else ""
        if line == f"  name: {name}":
            matched = True
    return False


def _migrated_oauth2(P):
    k3d = P.k3d
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


def _grep_context(text, needle, after):
    """Port of `grep -A<after> <needle>` over text."""
    lines = text.splitlines()
    out = []
    for idx, line in enumerate(lines):
        if needle in line:
            out.extend(lines[idx: idx + after + 1])
    return "\n".join(out)


# Welle 0: Pocket ID manifest + Service + DB-init Job

def test_pocket_id_k3d_pocket_id_yaml_exists(P):
    assert (P.k3d / "pocket-id.yaml").is_file()


def test_pocket_id_prod_patch_pocket_id_yaml_exists(P):
    assert (P.prod / "patch-pocket-id.yaml").is_file()


def test_pocket_id_k3d_kustomization_yaml_registers_pocket_id_yaml(P):
    assert _has(P.k3d / "kustomization.yaml", r"^\s*-\s*pocket-id\.yaml")


def test_pocket_id_prod_kustomization_yaml_registers_patch_pocket_id_yaml(P):
    assert _has(P.prod / "kustomization.yaml", r"^\s*-\s*path:\s*patch-pocket-id\.yaml")


def test_pocket_id_kustomize_build_k3d_emits_a_deployment_named_pocket_id(run_cmd, P):
    out = _kustomize(run_cmd, P.k3d)
    assert _awk_kind_name(out, "Deployment", "pocket-id")


def test_pocket_id_kustomize_build_k3d_emits_a_service_named_pocket_id(run_cmd, P):
    out = _kustomize(run_cmd, P.k3d)
    assert _awk_kind_name(out, "Service", "pocket-id")


def test_pocket_id_kustomize_build_k3d_emits_a_pocket_id_db_init_job(run_cmd, P):
    out = _kustomize(run_cmd, P.k3d)
    assert _awk_kind_name(out, "Job", "pocket-id-db-init")


def test_pocket_id_manifest_references_frontend_url_not_a_hardcoded_host(P):
    # The BATS negatives on id.mentolder / auth.mentolder end in `|| true` (no-ops)
    # and are not ported.
    assert _lit(P.k3d / "pocket-id.yaml", "${POCKET_ID_FRONTEND_URL}")


def test_pocket_id_prod_patch_overrides_entrypoint_to_websecure_and_adds_tls(P):
    patch = P.prod / "patch-pocket-id.yaml"
    assert _lit(patch, "websecure")
    assert _lit(patch, "tls:")
    assert _lit(patch, "TLS_SECRET_NAME")


def test_pocket_id_base_and_prod_overlays_use_a_pvc_for_app_data(P):
    manifest = P.k3d / "pocket-id.yaml"
    assert _lit(manifest, "pocket-id-data")
    assert _lit(manifest, "PersistentVolumeClaim")
    assert _lit(manifest, "claimName: pocket-id-data")


# Welle 0: domain-config + schema + env files

def test_pocket_id_configmap_domains_yaml_carries_pocket_id_domain_dev_literal(P):
    assert _has(P.k3d / "configmap-domains.yaml", r'^\s*POCKET_ID_DOMAIN:\s*"auth\.localhost"')


POCKET_ID_SECRETS = [
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


def test_pocket_id_schema_declares_all_16_pocket_id_secrets(P):
    missing = [s for s in POCKET_ID_SECRETS if not _has(P.schema, rf"^\s*-\s*name:\s*{s}\b")]
    assert not missing, f"missing from schema: {' '.join(missing)}"


def test_pocket_id_schema_declares_pocket_id_frontend_url_pocket_id_url_env_vars(P):
    assert _has(P.schema, r"^\s*-\s*name:\s*POCKET_ID_FRONTEND_URL\b")
    assert _has(P.schema, r"^\s*-\s*name:\s*POCKET_ID_URL\b")


def test_pocket_id_dev_env_file_sets_pocket_id_frontend_url_pocket_id_url(P):
    assert _has(P.env / "dev.yaml", r"^\s*POCKET_ID_FRONTEND_URL:")
    assert _has(P.env / "dev.yaml", r"^\s*POCKET_ID_URL:")


def test_pocket_id_mentolder_env_file_sets_pocket_id_frontend_url_https_auth_mentolder_de(P):
    f = P.env / "mentolder.yaml"
    assert _has(f, r'^\s*POCKET_ID_FRONTEND_URL:\s*"https://auth\.mentolder\.de"')
    assert _has(f, r"^\s*POCKET_ID_URL:")


def test_pocket_id_korczewski_env_file_sets_pocket_id_frontend_url_https_auth_korczewski_de(P):
    f = P.env / "korczewski.yaml"
    assert _has(f, r'^\s*POCKET_ID_FRONTEND_URL:\s*"https://auth\.korczewski\.de"')
    assert _has(f, r"^\s*POCKET_ID_URL:")


def test_pocket_id_fleet_mentolder_env_file_sets_pocket_id_frontend_url_https_auth_mentolder_de(P):
    assert _has(P.env / "fleet-mentolder.yaml", r'^\s*POCKET_ID_FRONTEND_URL:\s*"https://auth\.mentolder\.de"')


def test_pocket_id_fleet_korczewski_env_file_sets_pocket_id_frontend_url_https_auth_korczewski_de(P):
    assert _has(P.env / "fleet-korczewski.yaml", r'^\s*POCKET_ID_FRONTEND_URL:\s*"https://auth\.korczewski\.de"')


def test_pocket_id_taskfile_workspace_deploy_envsubst_list_contains_all_three_tokens(P):
    # Both the dev pipeline (around line 2473) and the prod ENVSUBST_VARS builder
    # (around line 2571) must include the three tokens.
    lines = _read(P.repo / "taskfiles" / "Taskfile.workspace.yml").splitlines()
    chunks = []
    for idx, line in enumerate(lines):
        if re.search(r"^  workspace:deploy:$", line):
            chunks.extend(lines[idx: idx + 301])
    snippet = "\n".join(chunks[:300])
    assert re.search(r"POCKET_ID_DOMAIN", snippet)
    assert re.search(r"POCKET_ID_FRONTEND_URL", snippet)
    assert re.search(r"POCKET_ID_URL", snippet)
    # dev envsubst and prod ENVSUBST_VARS: all three tokens on one line.
    assert re.search(r'envsubst ".*POCKET_ID_FRONTEND_URL.*POCKET_ID_URL.*POCKET_ID_DOMAIN', snippet, re.M)
    assert re.search(r"ENVSUBST_VARS.*POCKET_ID_FRONTEND_URL.*POCKET_ID_URL.*POCKET_ID_DOMAIN", snippet, re.M)


# Welle 1: oauth2-proxy services on Pocket ID

def test_pocket_id_oauth2_proxy_manifests_use_provider_oidc_no_keycloak_oidc(P):
    bad = [str(m) for m in _migrated_oauth2(P) if m.is_file() and _lit(m, "keycloak-oidc")]
    assert not bad, f"still use keycloak-oidc: {' '.join(bad)}"


def test_pocket_id_each_migrated_oauth2_proxy_references_a_pocket_id_secret(P):
    missing = [
        str(m) for m in _migrated_oauth2(P)
        if m.is_file() and not _has(m, r"POCKET_ID_[A-Z0-9_]+_SECRET")
    ]
    assert not missing, f"no POCKET_ID_*_SECRET in: {' '.join(missing)}"


def _rewire(P, rel, new, old):
    path = P.k3d / rel
    assert _lit(path, new)
    assert not _lit(path, old)


def test_pocket_id_oauth2_proxy_mailpit_rewires_mail_oidc_secret_to_pocket_id_mail_secret(P):
    _rewire(P, "oauth2-proxy-mailpit.yaml", "POCKET_ID_MAIL_SECRET", "MAIL_OIDC_SECRET")


def test_pocket_id_oauth2_proxy_traefik_rewires_traefik_oidc_secret_to_pocket_id_traefik_secret(P):
    _rewire(P, "oauth2-proxy-traefik.yaml", "POCKET_ID_TRAEFIK_SECRET", "TRAEFIK_OIDC_SECRET")


def test_pocket_id_oauth2_proxy_comfy_rewires_comfy_oidc_secret_to_pocket_id_comfy_secret(P):
    _rewire(P, "oauth2-proxy-comfy.yaml", "POCKET_ID_COMFY_SECRET", "COMFY_OIDC_SECRET")


def test_pocket_id_oauth2_proxy_brett_rewires_brett_oidc_secret_to_pocket_id_brett_secret(P):
    _rewire(P, "oauth2-proxy-brett.yaml", "POCKET_ID_BRETT_SECRET", "BRETT_OIDC_SECRET")


def test_pocket_id_oauth2_proxy_mediaviewer_rewires_mediaviewer_oidc_client_secret_to_pocket_id_mediaviewer_secret(P):
    _rewire(P, "oauth2-proxy-mediaviewer.yaml", "POCKET_ID_MEDIAVIEWER_SECRET", "MEDIAVIEWER_OIDC_CLIENT_SECRET")


def test_pocket_id_oauth2_proxy_videovault_rewires_videovault_oidc_secret_to_pocket_id_videovault_secret(P):
    _rewire(P, "oauth2-proxy-videovault.yaml", "POCKET_ID_VIDEOVAULT_SECRET", "VIDEOVAULT_OIDC_SECRET")


def test_pocket_id_oauth2_proxy_studio_rewires_studio_oidc_secret_to_pocket_id_studio_secret(P):
    _rewire(P, "oauth2-proxy-studio.yaml", "POCKET_ID_STUDIO_SECRET", "STUDIO_OIDC_SECRET")


def test_pocket_id_oauth2_proxy_brainstorm_rewires_brainstorm_oidc_secret_to_pocket_id_brainstorm_secret(P):
    path = P.k3d / "dev-stack" / "oauth2-proxy-brainstorm.yaml"
    assert _lit(path, "POCKET_ID_BRAINSTORM_SECRET")
    assert not _lit(path, "BRAINSTORM_OIDC_SECRET")


def test_pocket_id_oauth2_proxy_sessions_rewires_session_hub_oidc_secret_to_pocket_id_session_hub_secret(P):
    path = P.k3d / "dev-stack" / "oauth2-proxy-sessions.yaml"
    assert _lit(path, "POCKET_ID_SESSION_HUB_SECRET")
    assert not _lit(path, "SESSION_HUB_OIDC_SECRET")


def test_pocket_id_oauth2_proxy_issuer_urls_point_at_pocket_id_1411_in_dev(P):
    for m in _migrated_oauth2(P):
        if not m.is_file():
            continue
        ok = (
            _lit(m, "pocket-id:1411")
            or _lit(m, "pocket-id.workspace.svc.cluster.local:1411")
            or _lit(m, "POCKET_ID_DOMAIN")
            or _lit(m, "auth.${PROD_DOMAIN}")
        )
        assert ok, f"missing pocket-id issuer in {m}"


# Welle 1: vaultwarden inline OIDC + recovery-browser KC_DOMAIN -> POCKET_ID_DOMAIN

def test_pocket_id_k3d_vaultwarden_yaml_sso_authority_points_at_pocket_id(P):
    f = P.k3d / "vaultwarden.yaml"
    assert not _lit(f, "http://keycloak:8080/realms/workspace")
    assert _lit(f, "http://pocket-id:1411")
    assert _lit(f, "POCKET_ID_VAULTWARDEN_SECRET")
    assert not _lit(f, "VAULTWARDEN_OIDC_SECRET")


def test_pocket_id_prod_patch_vaultwarden_yaml_sso_authority_points_at_https_auth_prod_domain(P):
    f = P.prod / "patch-vaultwarden.yaml"
    assert _lit(f, "SSO_AUTHORITY")
    assert _lit(f, 'value: "https://auth.${PROD_DOMAIN}"')
    assert not _lit(f, "auth.${PROD_DOMAIN}/realms/workspace")


def test_pocket_id_k3d_recovery_browser_yaml_rewires_kc_domain_to_pocket_id_domain(P):
    f = P.k3d / "recovery-browser.yaml"
    assert _lit(f, "POCKET_ID_DOMAIN")
    assert _lit(f, "POCKET_ID_RECOVERY_SECRET")
    assert not _lit(f, "${KC_DOMAIN}/realms/workspace")


# Welle 1: prod-side oauth2-proxy patches

def test_pocket_id_prod_patch_oauth2_proxy_all_reference_pocket_id_secrets(P):
    missing = [
        str(m) for m in sorted(P.prod.glob("patch-oauth2-proxy-*.yaml"))
        if not _has(m, r"POCKET_ID_[A-Z0-9_]+_SECRET")
    ]
    assert not missing, f"no POCKET_ID_*_SECRET in: {' '.join(missing)}"


def test_pocket_id_prod_oauth2_proxy_patches_point_oidc_issuer_url_at_https_auth_prod_domain(P):
    for m in sorted(P.prod.glob("patch-oauth2-proxy-*.yaml")):
        assert _lit(m, "oidc-issuer-url=https://auth.${PROD_DOMAIN}"), f"prod patch {m} still has old issuer URL"


# Welle 2: website identity.ts + auth.ts + import sites

def test_pocket_id_components_website_lib_identity_ts_exists(P):
    assert (P.website / "src" / "lib" / "identity.ts").is_file()


IDENTITY_SYMBOLS = [
    "createUser", "setUserPassword", "sendPasswordResetEmail",
    "listUsers", "getUserById", "deleteUser", "updateUser",
    "updateUserAttribute", "listRealmRoles", "getUserRealmRoles",
    "assignRealmRole", "removeRealmRole",
    "listGroups", "assignUserToGroups",
]


def test_pocket_id_components_website_lib_identity_ts_exports_the_full_user_mgmt_surface(P):
    f = P.website / "src" / "lib" / "identity.ts"
    for sym in IDENTITY_SYMBOLS:
        assert _has(f, rf"export (async function|function|interface|const|let) {sym}\b"), f"missing export: {sym}"


def test_pocket_id_components_website_lib_identity_ts_calls_pocket_id_admin_api_with_x_api_key_header(P):
    # T002181: Pocket ID v2.9.0 does not accept a Bearer token on the Admin API;
    # identity.ts sets X-API-KEY on purpose. The negative checks the header
    # assignment only, because the explanatory comment mentions the Bearer form.
    f = P.website / "src" / "lib" / "identity.ts"
    assert _lit(f, "X-API-KEY")
    assert _lit(f, "POCKET_ID_API_KEY")
    assert not _has(f, r"^\s*'Authorization'\s*:")


def test_pocket_id_components_website_lib_auth_ts_no_longer_references_keycloak_url_keycloak_realm(P):
    f = P.website / "src" / "lib" / "auth.ts"
    assert not _lit(f, "KEYCLOAK_URL")
    assert not _lit(f, "KEYCLOAK_REALM")
    assert not _lit(f, "realms/workspace")


def test_pocket_id_components_website_lib_auth_provider_ts_uses_pocket_id_url_pocket_id_frontend_url(P):
    f = P.website / "src" / "lib" / "auth" / "provider.ts"
    assert _lit(f, "POCKET_ID_URL")
    assert _lit(f, "POCKET_ID_FRONTEND_URL")


def test_pocket_id_components_website_lib_auth_ts_sets_realm_roles_from_userinfo_is_admin(P):
    assert _lit(P.website / "src" / "lib" / "auth.ts", "isAdmin")


def test_pocket_id_27_import_sites_switched_from_lib_keycloak_to_lib_identity(P):
    src = P.website / "src"
    remaining = 0
    files = sorted(p for p in src.rglob("*") if p.is_file()) if src.is_dir() else []
    for f in files:
        if str(f).endswith("/lib/keycloak.ts"):
            continue
        text = _read(f)
        if "lib/keycloak" not in text:
            continue
        if re.search(r"from\s+['\"][^'\"]*lib/keycloak['\"]", text):
            print(f"still imports lib/keycloak: {f}")
            remaining += 1
    assert remaining == 0


def test_pocket_id_k3d_website_yaml_exposes_pocket_id_frontend_url_pocket_id_url_pocket_id_api_key(P):
    f = P.k3d / "website.yaml"
    assert _lit(f, "POCKET_ID_FRONTEND_URL")
    assert _lit(f, "POCKET_ID_URL")
    assert _lit(f, "POCKET_ID_API_KEY")
    assert _lit(f, "POCKET_ID_WEBSITE_SECRET")


# Welle 2: Nextcloud OIDC points at Pocket ID

def test_pocket_id_k3d_nextcloud_oidc_dev_php_points_at_http_pocket_id_1411(P):
    f = P.k3d / "nextcloud-oidc-dev.php"
    assert (
        _has(f, r"'oidc_login_provider_url'.*'http://pocket-id:1411'")
        or _has(f, r"oidc_login_provider_url.*=>.*'http://pocket-id:1411'")
    )
    assert _lit(f, "POCKET_ID_NEXTCLOUD_SECRET")


def test_pocket_id_prod_nextcloud_oidc_prod_php_points_at_pocket_id_https_auth_prod_domain(P):
    f = P.prod / "nextcloud-oidc-prod.php"
    assert _lit(f, "POCKET_ID_NEXTCLOUD_SECRET")
    assert _lit(f, "POCKET_ID_DOMAIN")
    assert not _lit(f, "keycloak:8080/realms/workspace")
    assert not _lit(f, "KC_DOMAIN")


# Welle 2: Grafana native OIDC points at Pocket ID

def test_pocket_id_prod_monitoring_grafana_oidc_patch_yaml_points_at_auth_prod_domain(P):
    f = P.prod / "monitoring" / "grafana-oidc-patch.yaml"
    assert _lit(f, "https://auth.${PROD_DOMAIN}/authorize")
    assert _lit(f, "https://auth.${PROD_DOMAIN}/api/oidc/token")
    assert _lit(f, "https://auth.${PROD_DOMAIN}/api/oidc/userinfo")
    assert _lit(f, "POCKET_ID_GRAFANA_SECRET")
    assert not _has(f, r"GF_AUTH_GENERIC_OAUTH_AUTH_URL.*auth.mentolder")


def test_pocket_id_k3d_monitoring_grafana_oidc_secret_yaml_carries_pocket_id_grafana_secret(P):
    assert _lit(P.k3d / "monitoring" / "grafana-oidc-secret.yaml", "POCKET_ID_GRAFANA_SECRET")


# Welle 2: Brett auth.ts repointed to Pocket ID

def test_pocket_id_components_brett_src_server_auth_ts_no_longer_references_keycloak(P):
    assert not _lit(P.brett / "src" / "server" / "auth.ts", "keycloak")


def test_pocket_id_components_brett_src_server_auth_ts_reads_pocket_id_url(P):
    assert _lit(P.brett / "src" / "server" / "auth.ts", "POCKET_ID_URL")


def test_pocket_id_brett_is_admin_from_claims_uses_is_admin_not_realm_access_roles(P):
    f = P.brett / "src" / "server" / "auth.ts"
    if _lit(f, "isAdminFromClaims"):
        assert _lit(f, "isAdmin")
    else:
        pytest.skip("brett isAdminFromClaims not present in current revision")


# E2E specs reference Pocket ID endpoints

def test_pocket_id_e2e_fa_15_oidc_spec_ts_no_longer_asserts_openid_connect_auth(P):
    assert not _lit(P.repo / "tests" / "e2e" / "specs" / "fa-15-oidc.spec.ts", "openid-connect/auth")


def test_pocket_id_e2e_sa_02_auth_spec_ts_no_longer_asserts_realms_workspace_redirect(P):
    assert not _lit(P.repo / "tests" / "e2e" / "specs" / "sa-02-auth.spec.ts", "realms/workspace")


# Welle 3: deferred

def test_pocket_id_welle_3_no_orphaned_keycloak_refs_after_welle_3_skipped_observation_gate(P):
    pytest.skip(
        "Welle 3 is gated on a 14+7 day production observation window. "
        "Will be enabled when Welle 0/1/2 ship and the observation period elapses."
    )


# Kustomize sanity

def test_pocket_id_kustomize_build_k3d_succeeds_no_broken_refs(run_cmd, P):
    _kustomize(run_cmd, P.k3d)


def test_pocket_id_kustomize_build_prod_succeeds_no_broken_refs(run_cmd, P):
    _kustomize(run_cmd, P.prod)


# T001087: Pocket ID OIDC-wiring fix (dev secrets + client seed job)

def test_pocket_id_wiring_k3d_kustomization_yaml_registers_pocket_id_client_seed_yaml(P):
    assert _has(P.k3d / "kustomization.yaml", r"^\s*-\s*pocket-id-client-seed\.yaml")


WORKSPACE_SECRET_KEYS = [
    "POCKET_ID_DB_PASSWORD", "POCKET_ID_API_KEY",
    "POCKET_ID_DOCS_SECRET", "POCKET_ID_MAIL_SECRET", "POCKET_ID_BRETT_SECRET",
    "POCKET_ID_COMFY_SECRET", "POCKET_ID_MEDIAVIEWER_SECRET", "POCKET_ID_VIDEOVAULT_SECRET",
    "POCKET_ID_STUDIO_SECRET", "POCKET_ID_TRAEFIK_SECRET", "POCKET_ID_RECOVERY_SECRET",
    "POCKET_ID_VAULTWARDEN_SECRET", "POCKET_ID_CLAUDE_CODE_SECRET",
    "POCKET_ID_SESSION_HUB_SECRET", "POCKET_ID_BRAINSTORM_SECRET", "POCKET_ID_NEXTCLOUD_SECRET",
]


def test_pocket_id_wiring_workspace_secrets_carries_all_pocket_id_client_app_keys_db_api_key(P):
    f = P.k3d / "secrets.yaml"
    missing = [k for k in WORKSPACE_SECRET_KEYS if not _has(f, rf"^\s*{k}:")]
    assert not missing, f"missing from k3d/secrets.yaml: {' '.join(missing)}"


def test_pocket_id_wiring_website_secrets_carries_pocket_id_website_secret_pocket_id_api_key(P):
    f = P.k3d / "website-dev-secrets.yaml"
    assert _has(f, r"^\s*POCKET_ID_WEBSITE_SECRET:")
    assert _has(f, r"^\s*POCKET_ID_API_KEY:")


def test_pocket_id_wiring_components_website_src_env_d_ts_declares_pocket_id_website_secret(P):
    assert _has(P.website / "src" / "env.d.ts", r"^\s*readonly POCKET_ID_WEBSITE_SECRET:\s*string")


def test_pocket_id_wiring_k3d_brett_yaml_sets_brett_kc_client_id_to_brett_not_brett_app(P):
    f = P.k3d / "brett.yaml"
    assert _has(f, r'^\s*value:\s*"brett"\s*$')
    assert not _has(f, r'^\s*value:\s*"brett-app"\s*$')


def test_pocket_id_wiring_schema_declares_pocket_id_nextcloud_secret(P):
    assert _has(P.schema, r"^\s*-\s*name:\s*POCKET_ID_NEXTCLOUD_SECRET\b")


def test_pocket_id_wiring_kustomize_build_k3d_emits_a_job_named_pocket_id_client_seed(run_cmd, P):
    out = _kustomize(run_cmd, P.k3d)
    assert _awk_kind_name(out, "Job", "pocket-id-client-seed")
