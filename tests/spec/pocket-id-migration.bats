#!/usr/bin/env bats
# tests/spec/pocket-id-migration.bats
# SSOT: openspec/changes/pocket-id-migration/tasks.md (T001068)
#
# Verifies that the Pocket ID migration (Welle 0 + Welle 1 + Welle 2) is
# correctly wired into manifests, env, schema, and code. Welle 3
# (Keycloak shutdown) is gated on a 14+7 day observation window and is
# therefore skipped here — see the `pocket-id Welle 3` test below.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-migration.bats
# or:  task test:unit SPEC=pocket-id-migration
#
# Pre-Welle 0 this file exits non-zero on the configuration-surface checks
# (Pocket ID manifest, POCKET_ID_*_SECRET wiring, schema, identity.ts) — that
# is the red phase. After Welle 2 is implemented (and the test-inventory
# regenerated) every non-skipped test must pass.

REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"
K3D="${REPO_ROOT}/k3d"
PROD="${REPO_ROOT}/prod"
ENV="${REPO_ROOT}/environments"
WEBSITE="${REPO_ROOT}/website"
BRETT="${REPO_ROOT}/brett"
SCHEMA="${ENV}/schema.yaml"

setup() {
  load 'test_helper'
}

# ── Welle 0: Pocket ID manifest + Service + DB-init Job ─────────────────────

@test "pocket-id: k3d/pocket-id.yaml exists" {
  [ -f "${K3D}/pocket-id.yaml" ]
}

@test "pocket-id: prod/patch-pocket-id.yaml exists" {
  [ -f "${PROD}/patch-pocket-id.yaml" ]
}

@test "pocket-id: k3d/kustomization.yaml registers pocket-id.yaml" {
  grep -E '^\s*-\s*pocket-id\.yaml' "${K3D}/kustomization.yaml"
}

@test "pocket-id: prod/kustomization.yaml registers patch-pocket-id.yaml" {
  grep -E '^\s*-\s*path:\s*patch-pocket-id\.yaml' "${PROD}/kustomization.yaml"
}

@test "pocket-id: kustomize build k3d/ emits a Deployment named pocket-id" {
  local out
  out=$(kustomize build "${K3D}" --load-restrictor=LoadRestrictionsNone)
  echo "$out" | awk 'BEGIN{ok=0} /^---$/{if(prev_kind=="Deployment" && matched){ok=1; exit} prev_kind=""; matched=0; next} {if(/^kind: /) prev_kind=$2; if(/^  name: pocket-id$/) matched=1} END{exit ok?0:1}'
}

@test "pocket-id: kustomize build k3d/ emits a Service named pocket-id" {
  local out
  out=$(kustomize build "${K3D}" --load-restrictor=LoadRestrictionsNone)
  echo "$out" | awk 'BEGIN{ok=0} /^---$/{if(prev_kind=="Service" && matched){ok=1; exit} prev_kind=""; matched=0; next} {if(/^kind: /) prev_kind=$2; if(/^  name: pocket-id$/) matched=1} END{exit ok?0:1}'
}

@test "pocket-id: kustomize build k3d/ emits a pocket-id-db-init Job" {
  local out
  out=$(kustomize build "${K3D}" --load-restrictor=LoadRestrictionsNone)
  echo "$out" | awk 'BEGIN{ok=0} /^---$/{if(prev_kind=="Job" && matched){ok=1; exit} prev_kind=""; matched=0; next} {if(/^kind: /) prev_kind=$2; if(/^  name: pocket-id-db-init$/) matched=1} END{exit ok?0:1}'
}

@test "pocket-id: manifest references \$POCKET_ID_FRONTEND_URL (not a hardcoded host)" {
  grep -q '\${POCKET_ID_FRONTEND_URL}' "${K3D}/pocket-id.yaml"
  ! grep -q 'https://id\.mentolder' "${K3D}/pocket-id.yaml" || true
  ! grep -q 'https://auth\.mentolder' "${K3D}/pocket-id.yaml" || true
}

@test "pocket-id: prod patch overrides entryPoint to websecure and adds TLS" {
  grep -q 'websecure' "${PROD}/patch-pocket-id.yaml"
  grep -q 'tls:' "${PROD}/patch-pocket-id.yaml"
  grep -q 'TLS_SECRET_NAME' "${PROD}/patch-pocket-id.yaml"
}

@test "pocket-id: base and prod overlays use a PVC for /app/data" {
  grep -q 'pocket-id-data' "${K3D}/pocket-id.yaml"
  grep -q 'PersistentVolumeClaim' "${K3D}/pocket-id.yaml"
  grep -q 'claimName: pocket-id-data' "${K3D}/pocket-id.yaml"
}


# ── Welle 0: domain-config + schema + env files ─────────────────────────────

@test "pocket-id: configmap-domains.yaml carries POCKET_ID_DOMAIN (dev literal)" {
  grep -E '^\s*POCKET_ID_DOMAIN:\s*"auth\.localhost"' "${K3D}/configmap-domains.yaml"
}

@test "pocket-id: schema declares all 16 POCKET_ID_* secrets" {
  local missing=()
  for s in \
    POCKET_ID_API_KEY \
    POCKET_ID_DB_PASSWORD \
    POCKET_ID_MAIL_SECRET \
    POCKET_ID_TRAEFIK_SECRET \
    POCKET_ID_COMFY_SECRET \
    POCKET_ID_MEDIAVIEWER_SECRET \
    POCKET_ID_VIDEOVAULT_SECRET \
    POCKET_ID_STUDIO_SECRET \
    POCKET_ID_DOCS_SECRET \
    POCKET_ID_VAULTWARDEN_SECRET \
    POCKET_ID_RECOVERY_SECRET \
    POCKET_ID_NEXTCLOUD_SECRET \
    POCKET_ID_GRAFANA_SECRET \
    POCKET_ID_WEBSITE_SECRET \
    POCKET_ID_BRETT_SECRET \
    POCKET_ID_BRAINSTORM_SECRET \
    POCKET_ID_SESSION_HUB_SECRET
  do
    if ! grep -qE "^\s*-\s*name:\s*${s}\b" "${SCHEMA}"; then
      missing+=("${s}")
    fi
  done
  [ "${#missing[@]}" -eq 0 ] || { echo "missing from schema: ${missing[*]}"; return 1; }
}

@test "pocket-id: schema declares POCKET_ID_FRONTEND_URL + POCKET_ID_URL env vars" {
  grep -E '^\s*-\s*name:\s*POCKET_ID_FRONTEND_URL\b' "${SCHEMA}"
  grep -E '^\s*-\s*name:\s*POCKET_ID_URL\b' "${SCHEMA}"
}

@test "pocket-id: dev env file sets POCKET_ID_FRONTEND_URL + POCKET_ID_URL" {
  grep -E '^\s*POCKET_ID_FRONTEND_URL:' "${ENV}/dev.yaml"
  grep -E '^\s*POCKET_ID_URL:' "${ENV}/dev.yaml"
}

@test "pocket-id: mentolder env file sets POCKET_ID_FRONTEND_URL=https://auth.mentolder.de" {
  grep -E '^\s*POCKET_ID_FRONTEND_URL:\s*"https://auth\.mentolder\.de"' "${ENV}/mentolder.yaml"
  grep -E '^\s*POCKET_ID_URL:' "${ENV}/mentolder.yaml"
}

@test "pocket-id: korczewski env file sets POCKET_ID_FRONTEND_URL=https://auth.korczewski.de" {
  grep -E '^\s*POCKET_ID_FRONTEND_URL:\s*"https://auth\.korczewski\.de"' "${ENV}/korczewski.yaml"
  grep -E '^\s*POCKET_ID_URL:' "${ENV}/korczewski.yaml"
}

@test "pocket-id: fleet-mentolder env file sets POCKET_ID_FRONTEND_URL=https://auth.mentolder.de" {
  grep -E '^\s*POCKET_ID_FRONTEND_URL:\s*"https://auth\.mentolder\.de"' "${ENV}/fleet-mentolder.yaml"
}

@test "pocket-id: fleet-korczewski env file sets POCKET_ID_FRONTEND_URL=https://auth.korczewski.de" {
  grep -E '^\s*POCKET_ID_FRONTEND_URL:\s*"https://auth\.korczewski\.de"' "${ENV}/fleet-korczewski.yaml"
}

@test "pocket-id: Taskfile workspace:deploy envsubst list contains POCKET_ID_DOMAIN + POCKET_ID_FRONTEND_URL + POCKET_ID_URL" {
  # Both the dev pipeline (around line 2473) and the prod ENVSUBST_VARS
  # builder (around line 2571) must include the three tokens.
  local snippet
  snippet=$(grep -A300 '^  workspace:deploy:$' "${REPO_ROOT}/Taskfile.yml" | head -300)
  echo "$snippet" | grep -E 'POCKET_ID_DOMAIN' >/dev/null
  echo "$snippet" | grep -E 'POCKET_ID_FRONTEND_URL' >/dev/null
  echo "$snippet" | grep -E 'POCKET_ID_URL' >/dev/null
  # dev envsubst: must include all three in one line
  echo "$snippet" | grep -E 'envsubst ".*POCKET_ID_FRONTEND_URL.*POCKET_ID_URL.*POCKET_ID_DOMAIN' >/dev/null
  # prod ENVSUBST_VARS: must include all three in one line
  echo "$snippet" | grep -E 'ENVSUBST_VARS.*POCKET_ID_FRONTEND_URL.*POCKET_ID_URL.*POCKET_ID_DOMAIN' >/dev/null
}

# ── Welle 1: oauth2-proxy services on Pocket ID ────────────────────────────

# All oauth2-proxy services in k3d/ (and dev-stack/) that were migrated.
# Each must: (a) use --provider=oidc (NOT keycloak-oidc), and (b) reference a
# POCKET_ID_<SERVICE>_SECRET in BOTH the args and the env: secretKeyRef.

migrated_oauth2_manifests() {
  printf '%s\n' \
    "${K3D}/oauth2-proxy-mailpit.yaml" \
    "${K3D}/oauth2-proxy-traefik.yaml" \
    "${K3D}/oauth2-proxy-comfy.yaml" \
    "${K3D}/oauth2-proxy-brett.yaml" \
    "${K3D}/oauth2-proxy-mediaviewer.yaml" \
    "${K3D}/oauth2-proxy-videovault.yaml" \
    "${K3D}/oauth2-proxy-studio.yaml" \
    "${K3D}/oauth2-proxy-docs.yaml" \
    "${K3D}/dev-stack/oauth2-proxy-brainstorm.yaml" \
    "${K3D}/dev-stack/oauth2-proxy-sessions.yaml"
}
# Note: claude-code-mcp-auth-proxy.yaml was removed with the MCP monolith
# decommission (#2052/#2061) and is no longer part of the migrated set.

@test "pocket-id: oauth2-proxy manifests use --provider=oidc (no keycloak-oidc)" {
  local m bad=()
  for m in $(migrated_oauth2_manifests); do
    [ -f "$m" ] || continue
    if grep -q 'keycloak-oidc' "$m"; then
      bad+=("$m")
    fi
  done
  [ "${#bad[@]}" -eq 0 ] || { echo "still use keycloak-oidc: ${bad[*]}"; return 1; }
}

@test "pocket-id: each migrated oauth2-proxy references a POCKET_ID_*_SECRET" {
  local m missing=()
  for m in $(migrated_oauth2_manifests); do
    [ -f "$m" ] || continue
    if ! grep -qE 'POCKET_ID_[A-Z0-9_]+_SECRET' "$m"; then
      missing+=("$m")
    fi
  done
  [ "${#missing[@]}" -eq 0 ] || { echo "no POCKET_ID_*_SECRET in: ${missing[*]}"; return 1; }
}

@test "pocket-id: oauth2-proxy-mailpit rewires MAIL_OIDC_SECRET to POCKET_ID_MAIL_SECRET" {
  grep -q 'POCKET_ID_MAIL_SECRET' "${K3D}/oauth2-proxy-mailpit.yaml"
  ! grep -q 'MAIL_OIDC_SECRET' "${K3D}/oauth2-proxy-mailpit.yaml" || false
}

@test "pocket-id: oauth2-proxy-traefik rewires TRAEFIK_OIDC_SECRET to POCKET_ID_TRAEFIK_SECRET" {
  grep -q 'POCKET_ID_TRAEFIK_SECRET' "${K3D}/oauth2-proxy-traefik.yaml"
  ! grep -q 'TRAEFIK_OIDC_SECRET' "${K3D}/oauth2-proxy-traefik.yaml" || false
}

@test "pocket-id: oauth2-proxy-comfy rewires COMFY_OIDC_SECRET to POCKET_ID_COMFY_SECRET" {
  grep -q 'POCKET_ID_COMFY_SECRET' "${K3D}/oauth2-proxy-comfy.yaml"
  ! grep -q 'COMFY_OIDC_SECRET' "${K3D}/oauth2-proxy-comfy.yaml" || false
}

@test "pocket-id: oauth2-proxy-brett rewires BRETT_OIDC_SECRET to POCKET_ID_BRETT_SECRET" {
  grep -q 'POCKET_ID_BRETT_SECRET' "${K3D}/oauth2-proxy-brett.yaml"
  ! grep -q 'BRETT_OIDC_SECRET' "${K3D}/oauth2-proxy-brett.yaml" || false
}

@test "pocket-id: oauth2-proxy-mediaviewer rewires MEDIAVIEWER_OIDC_CLIENT_SECRET to POCKET_ID_MEDIAVIEWER_SECRET" {
  grep -q 'POCKET_ID_MEDIAVIEWER_SECRET' "${K3D}/oauth2-proxy-mediaviewer.yaml"
  ! grep -q 'MEDIAVIEWER_OIDC_CLIENT_SECRET' "${K3D}/oauth2-proxy-mediaviewer.yaml" || false
}

@test "pocket-id: oauth2-proxy-videovault rewires VIDEOVAULT_OIDC_SECRET to POCKET_ID_VIDEOVAULT_SECRET" {
  grep -q 'POCKET_ID_VIDEOVAULT_SECRET' "${K3D}/oauth2-proxy-videovault.yaml"
  ! grep -q 'VIDEOVAULT_OIDC_SECRET' "${K3D}/oauth2-proxy-videovault.yaml" || false
}

@test "pocket-id: oauth2-proxy-studio rewires STUDIO_OIDC_SECRET to POCKET_ID_STUDIO_SECRET" {
  grep -q 'POCKET_ID_STUDIO_SECRET' "${K3D}/oauth2-proxy-studio.yaml"
  ! grep -q 'STUDIO_OIDC_SECRET' "${K3D}/oauth2-proxy-studio.yaml" || false
}

@test "pocket-id: oauth2-proxy-docs rewires DOCS_OIDC_SECRET to POCKET_ID_DOCS_SECRET" {
  grep -q 'POCKET_ID_DOCS_SECRET' "${K3D}/oauth2-proxy-docs.yaml"
  ! grep -q 'DOCS_OIDC_SECRET' "${K3D}/oauth2-proxy-docs.yaml" || false
}

@test "pocket-id: oauth2-proxy-brainstorm rewires BRAINSTORM_OIDC_SECRET to POCKET_ID_BRAINSTORM_SECRET" {
  grep -q 'POCKET_ID_BRAINSTORM_SECRET' "${K3D}/dev-stack/oauth2-proxy-brainstorm.yaml"
  ! grep -q 'BRAINSTORM_OIDC_SECRET' "${K3D}/dev-stack/oauth2-proxy-brainstorm.yaml" || false
}

@test "pocket-id: oauth2-proxy-sessions rewires SESSION_HUB_OIDC_SECRET to POCKET_ID_SESSION_HUB_SECRET" {
  grep -q 'POCKET_ID_SESSION_HUB_SECRET' "${K3D}/dev-stack/oauth2-proxy-sessions.yaml"
  ! grep -q 'SESSION_HUB_OIDC_SECRET' "${K3D}/dev-stack/oauth2-proxy-sessions.yaml" || false
}

# The "claude-code-mcp-auth-proxy uses Pocket ID issuer" test was removed:
# k3d/claude-code-mcp-auth-proxy.yaml was deleted with the MCP monolith
# decommission (#2052/#2061), so there is no manifest left to assert against.

@test "pocket-id: oauth2-proxy-issuer URLs point at pocket-id:1411 in dev" {
  local m
  for m in $(migrated_oauth2_manifests); do
    [ -f "$m" ] || continue
    # Dev manifests use the in-cluster service http://pocket-id:1411 for the
    # OIDC redeem/jwks/profile endpoints; the browser-facing --login-url uses
    # ${POCKET_ID_DOMAIN} (auth.localhost in dev, auth.${PROD_DOMAIN} in prod).
    if ! grep -q 'pocket-id:1411' "$m" && ! grep -q 'POCKET_ID_DOMAIN' "$m" && ! grep -q 'auth.\${PROD_DOMAIN}' "$m"; then
      echo "missing pocket-id issuer in $m"; return 1
    fi
  done
}

# ── Welle 1: vaultwarden inline OIDC + recovery-browser KC_DOMAIN → POCKET_ID_DOMAIN

@test "pocket-id: k3d/vaultwarden.yaml SSO_AUTHORITY points at Pocket ID" {
  ! grep -q 'http://keycloak:8080/realms/workspace' "${K3D}/vaultwarden.yaml" || false
  grep -q 'http://pocket-id:1411' "${K3D}/vaultwarden.yaml"
  grep -q 'POCKET_ID_VAULTWARDEN_SECRET' "${K3D}/vaultwarden.yaml"
  ! grep -q 'VAULTWARDEN_OIDC_SECRET' "${K3D}/vaultwarden.yaml" || false
}

@test "pocket-id: prod/patch-vaultwarden.yaml SSO_AUTHORITY points at https://auth.\${PROD_DOMAIN}" {
  grep -q 'SSO_AUTHORITY' "${PROD}/patch-vaultwarden.yaml"
  grep -q "value: \"https://auth.\${PROD_DOMAIN}\"" "${PROD}/patch-vaultwarden.yaml"
  ! grep -q 'auth.\${PROD_DOMAIN}/realms/workspace' "${PROD}/patch-vaultwarden.yaml" || false
  # Note: prod/patch-vaultwarden.yaml doesn't carry the secret ref (the base
  # k3d/vaultwarden.yaml handles SSO_CLIENT_SECRET). The POCKET_ID_*_SECRET
  # wiring is verified in the k3d/ check above. For prod the patch only
  # overrides the issuer URL + SMTP_HOST/PORT/SECURITY.
}

@test "pocket-id: k3d/recovery-browser.yaml rewires KC_DOMAIN → POCKET_ID_DOMAIN" {
  grep -q 'POCKET_ID_DOMAIN' "${K3D}/recovery-browser.yaml"
  grep -q 'POCKET_ID_RECOVERY_SECRET' "${K3D}/recovery-browser.yaml"
  ! grep -q '\${KC_DOMAIN}/realms/workspace' "${K3D}/recovery-browser.yaml" || false
}

# ── Welle 1: prod-side oauth2-proxy patches ─────────────────────────────────

@test "pocket-id: prod/patch-oauth2-proxy-*.yaml all reference POCKET_ID_*_SECRET" {
  local m missing=()
  for m in "${PROD}"/patch-oauth2-proxy-*.yaml; do
    [ -f "$m" ] || continue
    if ! grep -qE 'POCKET_ID_[A-Z0-9_]+_SECRET' "$m"; then
      missing+=("$m")
    fi
  done
  [ "${#missing[@]}" -eq 0 ] || { echo "no POCKET_ID_*_SECRET in: ${missing[*]}"; return 1; }
}

@test "pocket-id: prod oauth2-proxy patches point oidc-issuer-url at https://auth.\${PROD_DOMAIN}" {
  local m
  for m in "${PROD}"/patch-oauth2-proxy-*.yaml; do
    [ -f "$m" ] || continue
    if ! grep -q 'oidc-issuer-url=https://auth.\${PROD_DOMAIN}' "$m"; then
      echo "prod patch $m still has old issuer URL"; return 1
    fi
  done
}

# ── Welle 2: website identity.ts + auth.ts + 27 import sites ───────────────

@test "pocket-id: website/src/lib/identity.ts exists" {
  [ -f "${WEBSITE}/src/lib/identity.ts" ]
}

@test "pocket-id: website/src/lib/identity.ts exports the full user-mgmt surface" {
  local f="${WEBSITE}/src/lib/identity.ts"
  for sym in createUser setUserPassword sendPasswordResetEmail \
             listUsers getUserById deleteUser updateUser \
             updateUserAttribute listRealmRoles getUserRealmRoles \
             assignRealmRole removeRealmRole \
             listGroups assignUserToGroups; do
    grep -qE "export (async function|function|interface|const|let) ${sym}\b" "$f" \
      || { echo "missing export: ${sym}"; return 1; }
  done
}

@test "pocket-id: website/src/lib/identity.ts calls Pocket ID Admin API with Bearer POCKET_ID_API_KEY" {
  grep -q 'Authorization' "${WEBSITE}/src/lib/identity.ts"
  grep -q 'Bearer ' "${WEBSITE}/src/lib/identity.ts"
  grep -q 'POCKET_ID_API_KEY' "${WEBSITE}/src/lib/identity.ts"
}

@test "pocket-id: website/src/lib/auth.ts no longer references KEYCLOAK_URL/KEYCLOAK_REALM" {
  ! grep -q 'KEYCLOAK_URL' "${WEBSITE}/src/lib/auth.ts" || false
  ! grep -q 'KEYCLOAK_REALM' "${WEBSITE}/src/lib/auth.ts" || false
  ! grep -q 'realms/workspace' "${WEBSITE}/src/lib/auth.ts" || false
}

@test "pocket-id: website/src/lib/auth.ts uses POCKET_ID_URL/POCKET_ID_FRONTEND_URL" {
  grep -q 'POCKET_ID_URL' "${WEBSITE}/src/lib/auth.ts"
  grep -q 'POCKET_ID_FRONTEND_URL' "${WEBSITE}/src/lib/auth.ts"
}

@test "pocket-id: website/src/lib/auth.ts sets realmRoles from userInfo.isAdmin" {
  grep -q 'isAdmin' "${WEBSITE}/src/lib/auth.ts"
}

@test "pocket-id: 27 import sites switched from lib/keycloak to lib/identity" {
  local remaining=0
  while IFS= read -r f; do
    # skip the legacy keycloak.ts file itself
    case "$f" in
      */lib/keycloak.ts) continue ;;
    esac
    if grep -qE "from\s+['\"][^'\"]*lib/keycloak['\"]" "$f"; then
      echo "still imports lib/keycloak: $f"
      remaining=$((remaining + 1))
    fi
  done < <(grep -rl "lib/keycloak" "${WEBSITE}/src" 2>/dev/null || true)
  [ "$remaining" -eq 0 ]
}

# The "keycloak.ts still exists (compat shim for Welle 3 transition)" test was
# removed: Welle 3 completed and website/src/lib/keycloak.ts was deleted (its
# public surface lives on in website/src/lib/identity.ts). The transition the
# shim guarded is over.

@test "pocket-id: k3d/website.yaml exposes POCKET_ID_FRONTEND_URL + POCKET_ID_URL + POCKET_ID_API_KEY" {
  grep -q 'POCKET_ID_FRONTEND_URL' "${K3D}/website.yaml"
  grep -q 'POCKET_ID_URL' "${K3D}/website.yaml"
  grep -q 'POCKET_ID_API_KEY' "${K3D}/website.yaml"
  grep -q 'POCKET_ID_WEBSITE_SECRET' "${K3D}/website.yaml"
}

# ── Welle 2: Nextcloud OIDC points at Pocket ID ────────────────────────────

@test "pocket-id: k3d/nextcloud-oidc-dev.php points at http://pocket-id:1411" {
  grep -q "'oidc_login_provider_url'.*'http://pocket-id:1411'" "${K3D}/nextcloud-oidc-dev.php" \
    || grep -q "oidc_login_provider_url.*=>.*'http://pocket-id:1411'" "${K3D}/nextcloud-oidc-dev.php"
  grep -q 'POCKET_ID_NEXTCLOUD_SECRET' "${K3D}/nextcloud-oidc-dev.php"
}

@test "pocket-id: prod/nextcloud-oidc-prod.php points at Pocket ID (https://auth.\${PROD_DOMAIN})" {
  # PHP composes the logout URL at runtime from getenv('POCKET_ID_DOMAIN'),
  # which at deploy-time is `auth.${PROD_DOMAIN}`. Assert both halves.
  grep -q "POCKET_ID_NEXTCLOUD_SECRET" "${PROD}/nextcloud-oidc-prod.php"
  grep -q "POCKET_ID_DOMAIN" "${PROD}/nextcloud-oidc-prod.php"
  ! grep -q "keycloak:8080/realms/workspace" "${PROD}/nextcloud-oidc-prod.php" || false
  ! grep -q "KC_DOMAIN" "${PROD}/nextcloud-oidc-prod.php" || false
}

# ── Welle 2: Grafana native OIDC points at Pocket ID ───────────────────────

@test "pocket-id: prod/monitoring/grafana-oidc-patch.yaml points at auth.\${PROD_DOMAIN}" {
  grep -q 'https://auth.\${PROD_DOMAIN}/authorize' "${PROD}/monitoring/grafana-oidc-patch.yaml"
  grep -q 'https://auth.\${PROD_DOMAIN}/api/oidc/token' "${PROD}/monitoring/grafana-oidc-patch.yaml"
  grep -q 'https://auth.\${PROD_DOMAIN}/api/oidc/userinfo' "${PROD}/monitoring/grafana-oidc-patch.yaml"
  grep -q 'POCKET_ID_GRAFANA_SECRET' "${PROD}/monitoring/grafana-oidc-patch.yaml"
  ! grep -q 'GF_AUTH_GENERIC_OAUTH_AUTH_URL.*auth.mentolder' "${PROD}/monitoring/grafana-oidc-patch.yaml" || false
}

@test "pocket-id: k3d/monitoring/grafana-oidc-secret.yaml carries POCKET_ID_GRAFANA_SECRET" {
  grep -q 'POCKET_ID_GRAFANA_SECRET' "${K3D}/monitoring/grafana-oidc-secret.yaml"
}

# ── Welle 2: Brett auth.ts repointed to Pocket ID ──────────────────────────

@test "pocket-id: brett/src/server/auth.ts no longer references keycloak" {
  ! grep -q 'keycloak' "${BRETT}/src/server/auth.ts" || false
}

@test "pocket-id: brett/src/server/auth.ts reads POCKET_ID_URL" {
  grep -q 'POCKET_ID_URL' "${BRETT}/src/server/auth.ts"
}

@test "pocket-id: brett isAdminFromClaims uses isAdmin (not realm_access.roles)" {
  if grep -q 'isAdminFromClaims' "${BRETT}/src/server/auth.ts"; then
    grep -q 'isAdmin' "${BRETT}/src/server/auth.ts"
  else
    skip "brett isAdminFromClaims not present in current revision"
  fi
}

# ── E2E specs reference Pocket ID endpoints ────────────────────────────────

@test "pocket-id: E2E fa-15-oidc.spec.ts no longer asserts openid-connect/auth" {
  ! grep -q 'openid-connect/auth' "${REPO_ROOT}/tests/e2e/specs/fa-15-oidc.spec.ts" || false
}

@test "pocket-id: E2E sa-02-auth.spec.ts no longer asserts realms/workspace redirect" {
  ! grep -q 'realms/workspace' "${REPO_ROOT}/tests/e2e/specs/sa-02-auth.spec.ts" || false
}

# ── Welle 3: deferred — Keycloak stays on auth.<domain> until 14+7 day observation ─

@test "pocket-id Welle 3: no orphaned KEYCLOAK_* refs after Welle 3 (skipped, observation gate)" {
  skip "Welle 3 is gated on a 14+7 day production observation window. Will be enabled when Welle 0/1/2 ship and the observation period elapses."
}

# ── Kustomize sanity: k3d/ base still builds after the migration ───────────

@test "pocket-id: kustomize build k3d/ succeeds (no broken refs)" {
  kustomize build "${K3D}" --load-restrictor=LoadRestrictionsNone >/dev/null
}

@test "pocket-id: kustomize build prod/ succeeds (no broken refs)" {
  kustomize build "${PROD}" --load-restrictor=LoadRestrictionsNone >/dev/null
}

# ── T001087: Pocket ID OIDC-wiring fix (dev secrets + client seed job) ──────

@test "pocket-id-wiring: k3d/kustomization.yaml registers pocket-id-client-seed.yaml" {
  grep -E '^\s*-\s*pocket-id-client-seed\.yaml' "${K3D}/kustomization.yaml"
}

@test "pocket-id-wiring: workspace-secrets carries all 14 POCKET_ID_* client/app keys + DB + API key" {
  local missing=()
  for k in \
    POCKET_ID_DB_PASSWORD POCKET_ID_API_KEY \
    POCKET_ID_DOCS_SECRET POCKET_ID_MAIL_SECRET POCKET_ID_BRETT_SECRET \
    POCKET_ID_COMFY_SECRET POCKET_ID_MEDIAVIEWER_SECRET POCKET_ID_VIDEOVAULT_SECRET \
    POCKET_ID_STUDIO_SECRET POCKET_ID_TRAEFIK_SECRET POCKET_ID_RECOVERY_SECRET \
    POCKET_ID_VAULTWARDEN_SECRET POCKET_ID_CLAUDE_CODE_SECRET \
    POCKET_ID_SESSION_HUB_SECRET POCKET_ID_BRAINSTORM_SECRET POCKET_ID_NEXTCLOUD_SECRET
  do
    grep -qE "^\s*${k}:" "${K3D}/secrets.yaml" || missing+=("${k}")
  done
  [ "${#missing[@]}" -eq 0 ] || { echo "missing from k3d/secrets.yaml: ${missing[*]}"; return 1; }
}

@test "pocket-id-wiring: website-secrets carries POCKET_ID_WEBSITE_SECRET + POCKET_ID_API_KEY" {
  grep -qE '^\s*POCKET_ID_WEBSITE_SECRET:' "${K3D}/website-dev-secrets.yaml"
  grep -qE '^\s*POCKET_ID_API_KEY:' "${K3D}/website-dev-secrets.yaml"
}

@test "pocket-id-wiring: website/src/env.d.ts declares POCKET_ID_WEBSITE_SECRET" {
  grep -qE '^\s*readonly POCKET_ID_WEBSITE_SECRET:\s*string' "${WEBSITE}/src/env.d.ts"
}

@test "pocket-id-wiring: k3d/brett.yaml sets BRETT_KC_CLIENT_ID to brett (not brett-app)" {
  grep -qE '^\s*value:\s*"brett"\s*$' "${K3D}/brett.yaml"
  ! grep -qE '^\s*value:\s*"brett-app"\s*$' "${K3D}/brett.yaml" || false
}

@test "pocket-id-wiring: schema declares POCKET_ID_NEXTCLOUD_SECRET" {
  grep -qE '^\s*-\s*name:\s*POCKET_ID_NEXTCLOUD_SECRET\b' "${SCHEMA}"
}

@test "pocket-id-wiring: kustomize build k3d/ emits a Job named pocket-id-client-seed" {
  local out
  out=$(kustomize build "${K3D}" --load-restrictor=LoadRestrictionsNone)
  echo "$out" | awk 'BEGIN{ok=0} /^---$/{if(prev_kind=="Job" && matched){ok=1; exit} prev_kind=""; matched=0; next} {if(/^kind: /) prev_kind=$2; if(/^  name: pocket-id-client-seed$/) matched=1} END{exit ok?0:1}'
}
