#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# pre-deploy-check.sh — Pre-flight validation before workspace:deploy
# ═══════════════════════════════════════════════════════════════════
# Usage: bash scripts/pre-deploy-check.sh [ENV]
#        bash scripts/pre-deploy-check.sh korczewski
#        bash scripts/pre-deploy-check.sh          # defaults to dev
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

ENV="${1:-dev}"
ENV_DIR="environments"
SCHEMA="${ENV_DIR}/schema.yaml"
ENV_FILE="${ENV_DIR}/${ENV}.yaml"

ERRORS=0
WARNINGS=0

# Resolve namespace early via env-resolve.sh in a subshell so the rest of the
# script can target the right namespace for korczewski (workspace-korczewski)
# without polluting this shell's variables.
WS_NS=$( ( source "$(dirname "${BASH_SOURCE[0]}")/env-resolve.sh" "$ENV" "$ENV_DIR" 2>/dev/null \
  && printf '%s' "${WORKSPACE_NAMESPACE:-workspace}" ) || printf 'workspace' )

# ── Colors ────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi

pass()  { echo -e "  ${GREEN}✓${RESET} $*"; }
fail()  { echo -e "  ${RED}✗${RESET} $*"; ((ERRORS++)) || true; }
warn()  { echo -e "  ${YELLOW}⚠${RESET} $*"; ((WARNINGS++)) || true; }
info()  { echo -e "  ${CYAN}·${RESET} $*"; }
section() { echo -e "\n${BOLD}── $* ──${RESET}"; }

# ── Helpers ───────────────────────────────────────────────────────

yaml_get() {
  local file="$1" key="$2"
  grep -E "^[[:space:]]*${key}:" "$file" 2>/dev/null | head -1 \
    | sed 's/^[^:]*:[[:space:]]*//' \
    | sed "s/^[\"']//" | sed "s/[\"']$//" | sed 's/[[:space:]]*$//'
}

sealed_keys() {
  awk '
    /^[[:space:]]*encryptedData:/ { in_enc=1; next }
    in_enc && /^[[:space:]]+[A-Za-z0-9_]+:/ {
      match($0, /[A-Za-z0-9_]+:/); print substr($0, RSTART, RLENGTH-1); next
    }
    in_enc && /^[[:space:]]*[a-z]/ && !/^[[:space:]]+[A-Za-z0-9_]+:/ { in_enc=0 }
  ' "$1"
}

schema_keys() {
  local section="$1"
  awk -v sect="$section" '
    /^[a-z_]+:/ { in_sect = ($0 ~ "^" sect ":"); next }
    in_sect && /^[[:space:]]*- name:/ {
      sub(/^[[:space:]]*- name:[[:space:]]*/, ""); gsub(/"/, ""); print
    }
  ' "$SCHEMA"
}

schema_field() {
  local section="$1" key="$2" field="$3"
  awk -v sect="$section" -v kn="$key" -v fn="$field" '
    /^[a-z_]+:/ { in_sect = ($0 ~ "^" sect ":"); next }
    in_sect && /^[[:space:]]*- name:/ {
      sub(/^[[:space:]]*- name:[[:space:]]*/, ""); gsub(/"/, ""); cur=$0; next
    }
    in_sect && cur == kn && $0 ~ "^[[:space:]]+" fn ":" {
      val=$0; sub(/^[^:]*:[[:space:]]*/, "", val); gsub(/"/, "", val); print val; exit
    }
  ' "$SCHEMA"
}

# ── Banner ────────────────────────────────────────────────────────
echo -e "\n${BOLD}workspace pre-deploy-check  ENV=${ENV}${RESET}"

IS_DEV=false
[[ "$ENV" == "dev" ]] && IS_DEV=true

# ════════════════════════════════════════════════════════════════════
section "1. Tool prerequisites"
# ════════════════════════════════════════════════════════════════════

for tool in kubectl kustomize envsubst python3; do
  if command -v "$tool" >/dev/null 2>&1; then
    pass "$tool found ($(command -v "$tool"))"
  else
    fail "$tool not found — install it before deploying"
  fi
done

if python3 -c "import yaml" 2>/dev/null; then
  pass "python3 PyYAML available"
else
  fail "PyYAML not installed — run: pip install pyyaml"
fi

if [[ "$IS_DEV" == "false" ]]; then
  if command -v kubeseal >/dev/null 2>&1; then
    pass "kubeseal found (needed for env:seal)"
  else
    warn "kubeseal not found — only needed if you need to re-seal secrets"
  fi
fi

# ════════════════════════════════════════════════════════════════════
section "2. Environment file & schema"
# ════════════════════════════════════════════════════════════════════

if [[ ! -f "$SCHEMA" ]]; then
  fail "Schema not found: ${SCHEMA}"
  echo -e "\n${RED}ABORT: cannot continue without schema.${RESET}"
  exit 1
fi
pass "Schema found: ${SCHEMA}"

if [[ ! -f "$ENV_FILE" ]]; then
  fail "Environment file not found: ${ENV_FILE}"
  echo -e "\n${RED}ABORT: cannot continue without environment file.${RESET}"
  exit 1
fi
pass "Environment file found: ${ENV_FILE}"

# Env resolution sanity — run in subshell to avoid polluting this shell
if (source scripts/env-resolve.sh "$ENV" "$ENV_DIR" >/dev/null 2>&1); then
  pass "env-resolve.sh sources cleanly for ENV=${ENV}"
else
  fail "env-resolve.sh failed for ENV=${ENV} — check required vars and PyYAML"
fi

# Full schema validation (same as task env:validate, without cluster check)
if bash scripts/env-validate.sh --env "$ENV" --env-dir "$ENV_DIR" --schema-only >/dev/null 2>&1; then
  pass "Schema validation passed (env:validate --schema-only)"
else
  # Run again to show errors
  echo ""
  bash scripts/env-validate.sh --env "$ENV" --env-dir "$ENV_DIR" --schema-only 2>&1 | sed 's/^/    /' || true
  fail "Schema validation failed — fix errors above before deploying"
fi

# Placeholder check on env file
PLACEHOLDERS="yourdomain\.tld|yourbrand\.tld|info@yourdomain\.tld|MANAGED_EXTERNALLY|REPLACE_ME|FILL_FROM_ENV|FILL_ME"
if grep -qE "$PLACEHOLDERS" "$ENV_FILE" 2>/dev/null; then
  bad=$(grep -E "$PLACEHOLDERS" "$ENV_FILE" | sed 's/^/    /')
  fail "Placeholder values found in ${ENV_FILE}:\n${bad}"
else
  pass "No placeholder values in ${ENV_FILE}"
fi

# ════════════════════════════════════════════════════════════════════
section "3. Sealed Secrets file (prod only)"
# ════════════════════════════════════════════════════════════════════

if [[ "$IS_DEV" == "true" ]]; then
  info "Dev environment — SealedSecrets not used"

  # Check dev secrets.yaml for placeholders
  DEV_SECRETS="k3d/secrets.yaml"
  if [[ -f "$DEV_SECRETS" ]]; then
    if grep -qE "$PLACEHOLDERS" "$DEV_SECRETS" 2>/dev/null; then
      bad=$(grep -E "$PLACEHOLDERS" "$DEV_SECRETS" | sed 's/^/    /')
      warn "Placeholder values in ${DEV_SECRETS} (ok for dev, but check intentionality):\n${bad}"
    else
      pass "${DEV_SECRETS} — no raw placeholders"
    fi
  else
    fail "${DEV_SECRETS} not found"
  fi
else
  SECRETS_REF=$(yaml_get "$ENV_FILE" "secrets_ref")
  if [[ -z "$SECRETS_REF" ]]; then
    fail "secrets_ref not set in ${ENV_FILE} — required for non-dev"
  else
    SEALED_FILE="${ENV_DIR}/${SECRETS_REF}"
    if [[ ! -f "$SEALED_FILE" ]]; then
      fail "SealedSecret file missing: ${SEALED_FILE} — run: task env:seal ENV=${ENV}"
    else
      pass "SealedSecret file found: ${SEALED_FILE}"

      # Check all required secrets are present in the sealed file
      sealed=$(sealed_keys "$SEALED_FILE")
      missing_keys=()
      while IFS= read -r key; do
        [[ -z "$key" ]] && continue
        req=$(schema_field "secrets" "$key" "required")
        [[ "$req" != "true" ]] && continue
        if ! echo "$sealed" | grep -qx "$key"; then
          missing_keys+=("$key")
        fi
      done < <(schema_keys "secrets")

      if [[ ${#missing_keys[@]} -gt 0 ]]; then
        fail "SealedSecret missing required keys: ${missing_keys[*]}"
        info "Re-run: task env:generate ENV=${ENV} && task env:seal ENV=${ENV}"
      else
        pass "All required secret keys present in SealedSecret"
      fi

      # Check sealed setup_vars (KC_USER*_PASSWORD)
      while IFS= read -r key; do
        [[ -z "$key" ]] && continue
        is_sealed=$(schema_field "setup_vars" "$key" "sealed")
        [[ "$is_sealed" != "true" ]] && continue
        if ! echo "$sealed" | grep -qx "$key"; then
          fail "SealedSecret missing sealed setup_var: ${key}"
        else
          pass "Sealed setup_var present: ${key}"
        fi
      done < <(schema_keys "setup_vars")

      # Check the multi-document file for expected SealedSecret names
      for expected_name in workspace-secrets website-secrets coturn-secrets collabora-secrets ipv64-api-key; do
        if grep -q "name: ${expected_name}" "$SEALED_FILE" 2>/dev/null; then
          pass "SealedSecret '${expected_name}' present in file"
        else
          warn "SealedSecret '${expected_name}' not found in ${SEALED_FILE} — expected for prod"
        fi
      done
    fi
  fi
fi

# ════════════════════════════════════════════════════════════════════
section "4. Kustomize overlay & source files"
# ════════════════════════════════════════════════════════════════════

if [[ "$IS_DEV" == "true" ]]; then
  OVERLAY_DIR="k3d"
else
  OVERLAY_DIR=$(yaml_get "$ENV_FILE" "overlay")
  if [[ -z "$OVERLAY_DIR" ]]; then
    fail "overlay not set in ${ENV_FILE}"
    OVERLAY_DIR="prod"
  fi
fi

if [[ -d "$OVERLAY_DIR" ]]; then
  pass "Overlay directory exists: ${OVERLAY_DIR}/"
else
  fail "Overlay directory missing: ${OVERLAY_DIR}/"
fi

if [[ -f "${OVERLAY_DIR}/kustomization.yaml" ]]; then
  pass "kustomization.yaml found in ${OVERLAY_DIR}/"
else
  fail "kustomization.yaml missing in ${OVERLAY_DIR}/"
fi

# Check realm JSON for this env
if [[ "$IS_DEV" == "true" ]]; then
  realm_file="k3d/realm-workspace-dev.json"
else
  # Prod-specific realm first, fall back to prod base realm
  realm_file="${OVERLAY_DIR}/realm-workspace-${ENV}.json"
  if [[ ! -f "$realm_file" ]]; then
    realm_file="prod/realm-workspace-prod.json"
  fi
fi
if [[ -f "$realm_file" ]]; then
  pass "Realm JSON found: ${realm_file}"
  # Validate JSON syntax
  if python3 -c "import json,sys; json.load(open('${realm_file}'))" 2>/dev/null; then
    pass "Realm JSON is valid JSON"
  else
    fail "Realm JSON is malformed: ${realm_file}"
  fi
else
  fail "Realm JSON not found: ${realm_file}"
fi

# Check OIDC PHP config
if [[ "$IS_DEV" == "true" ]]; then
  oidc_file="k3d/nextcloud-oidc-dev.php"
else
  oidc_file="prod/nextcloud-oidc-prod.php"
fi
if [[ -f "$oidc_file" ]]; then
  pass "Nextcloud OIDC config found: ${oidc_file}"
else
  fail "Nextcloud OIDC config missing: ${oidc_file}"
fi

# Kustomize build dry-run (catches missing patches, bad refs)
info "Running kustomize build dry-run on ${OVERLAY_DIR}/ ..."
if kustomize build "${OVERLAY_DIR}/" --load-restrictor=LoadRestrictionsNone >/dev/null 2>/tmp/kustomize-build-err; then
  pass "kustomize build ${OVERLAY_DIR}/ succeeded"
else
  fail "kustomize build ${OVERLAY_DIR}/ failed:"
  sed 's/^/    /' /tmp/kustomize-build-err
fi
rm -f /tmp/kustomize-build-err

# ════════════════════════════════════════════════════════════════════
section "5. Cluster connectivity & namespaces"
# ════════════════════════════════════════════════════════════════════

if [[ "$IS_DEV" == "true" ]]; then
  # Check k3d cluster is running
  if kubectl cluster-info >/dev/null 2>&1; then
    pass "kubectl cluster-info OK (dev context)"
  else
    fail "kubectl cluster-info failed — is k3d running? Run: task cluster:create"
  fi
  CTX_FLAG=""
else
  ENV_CTX=$(yaml_get "$ENV_FILE" "context")
  if [[ -z "$ENV_CTX" ]]; then
    fail "context not set in ${ENV_FILE}"
    CTX_FLAG=""
  else
    CTX_FLAG="--context ${ENV_CTX}"

    # Check cluster reachability
    if kubectl $CTX_FLAG cluster-info >/dev/null 2>&1; then
      pass "Cluster reachable: ${ENV_CTX}"
    else
      fail "Cluster not reachable: ${ENV_CTX} — check kubeconfig and VPN/network"
    fi

    # Check kubectl context matches expected
    active=$(kubectl config current-context 2>/dev/null || echo "none")
    if [[ "$active" == "$ENV_CTX" ]]; then
      pass "Active kubectl context matches ENV: ${ENV_CTX}"
    else
      warn "Active context is '${active}', deploy will switch to '${ENV_CTX}' automatically"
    fi
  fi
fi

# Check required namespaces or ability to create them
for ns in "$WS_NS"; do
  if kubectl $CTX_FLAG get namespace "$ns" >/dev/null 2>&1; then
    pass "Namespace exists: ${ns}"
  else
    info "Namespace '${ns}' will be created by deploy"
  fi
done

# Prod-only: cert-manager ns (needed for ipv64-api-key SealedSecret)
if [[ "$IS_DEV" == "false" ]]; then
  if kubectl $CTX_FLAG get namespace cert-manager >/dev/null 2>&1; then
    pass "Namespace exists: cert-manager"
  else
    info "Namespace 'cert-manager' will be created by deploy (for ipv64-api-key)"
  fi
fi

# ════════════════════════════════════════════════════════════════════
section "6. Sealed Secrets controller (prod only)"
# ════════════════════════════════════════════════════════════════════

if [[ "$IS_DEV" == "true" ]]; then
  info "Dev environment — Sealed Secrets controller not required"
else
  # Look for sealed-secrets controller in kube-system or sealed-secrets ns
  controller_found=false
  for ns in kube-system sealed-secrets; do
    if kubectl $CTX_FLAG get pods -n "$ns" -l "app.kubernetes.io/name=sealed-secrets" \
        --field-selector=status.phase=Running -o name 2>/dev/null | grep -q .; then
      pass "Sealed Secrets controller running in namespace: ${ns}"
      controller_found=true
      break
    fi
  done

  if [[ "$controller_found" == "false" ]]; then
    # Try broader search
    if kubectl $CTX_FLAG get pods -A -l "app.kubernetes.io/name=sealed-secrets" \
        --field-selector=status.phase=Running -o name 2>/dev/null | grep -q .; then
      pass "Sealed Secrets controller running (non-standard namespace)"
    else
      fail "Sealed Secrets controller not running — SealedSecrets will not decrypt"
      info "Run: task sealed-secrets:install (or check: task sealed-secrets:status)"
    fi
  fi

  # Check if workspace-secrets already exists (prior deploy) — informational
  if kubectl $CTX_FLAG get secret workspace-secrets -n "$WS_NS" >/dev/null 2>&1; then
    pass "workspace-secrets already exists in ${WS_NS} (prior deploy)"
  else
    info "workspace-secrets not yet in ${WS_NS} — will be created by SealedSecret decryption"
  fi
fi

# ════════════════════════════════════════════════════════════════════
section "7. NetworkPolicy target namespaces"
# ════════════════════════════════════════════════════════════════════

NP_NAMESPACES=(kube-system)
if [[ "$IS_DEV" == "false" ]]; then
  # WEBSITE_NAMESPACE is per-env (website / website-korczewski). coturn +
  # workspace-office are cluster-wide.
  WS_WEB_NS=$( ( source "$(dirname "${BASH_SOURCE[0]}")/env-resolve.sh" "$ENV" "$ENV_DIR" 2>/dev/null \
    && printf '%s' "${WEBSITE_NAMESPACE:-website}" ) || printf 'website' )
  NP_NAMESPACES+=(coturn workspace-office "$WS_WEB_NS")
fi

for ns in "${NP_NAMESPACES[@]}"; do
  if kubectl $CTX_FLAG get namespace "$ns" >/dev/null 2>&1; then
    pass "NetworkPolicy target namespace exists: ${ns}"
  else
    warn "NetworkPolicy target namespace missing: ${ns} — some policies will have no effect until it is created"
  fi
done

# ════════════════════════════════════════════════════════════════════
section "8. Envsubst variable coverage"
# ════════════════════════════════════════════════════════════════════

# Load env vars in subshell to check they resolve
if [[ "$IS_DEV" == "true" ]]; then
  ENVSUBST_VARS="PROD_DOMAIN BRAND_NAME CONTACT_EMAIL BRAND_ID"
else
  ENVSUBST_VARS="PROD_DOMAIN BRAND_NAME CONTACT_EMAIL INFRA_NAMESPACE TLS_SECRET_NAME SMTP_FROM MAIL_FROM_LOCAL MAIL_FROM_DOMAIN WEBSITE_IMAGE TURN_PUBLIC_IP TURN_NODE BRAND_ID KC_USER1_USERNAME KC_USER1_EMAIL KC_USER2_USERNAME KC_USER2_EMAIL BRETT_DOMAIN"
fi

missing_vars=()
# Source env in a subshell and check each var
while IFS= read -r varname; do
  # MAIL_FROM_LOCAL and MAIL_FROM_DOMAIN are derived at deploy time — skip
  [[ "$varname" == "MAIL_FROM_LOCAL" || "$varname" == "MAIL_FROM_DOMAIN" ]] && continue
  if ! (source scripts/env-resolve.sh "$ENV" "$ENV_DIR" 2>/dev/null; \
        [[ -n "${!varname:-}" ]]); then
    missing_vars+=("$varname")
  fi
done < <(tr ' ' '\n' <<< "$ENVSUBST_VARS")

if [[ ${#missing_vars[@]} -gt 0 ]]; then
  fail "Envsubst vars missing from env resolution: ${missing_vars[*]}"
else
  pass "All envsubst variables resolve to non-empty values"
fi

# ════════════════════════════════════════════════════════════════════
section "9. Pre-existing cluster health (informational)"
# ════════════════════════════════════════════════════════════════════

# Show crash-looping pods that might indicate a broken prior deploy
if kubectl $CTX_FLAG get pods -n "$WS_NS" \
    --field-selector=status.phase!=Running,status.phase!=Succeeded \
    -o name 2>/dev/null | grep -q .; then
  warn "Non-running pods found in '${WS_NS}' namespace (may be normal during partial deploy):"
  kubectl $CTX_FLAG get pods -n "$WS_NS" \
    --field-selector=status.phase!=Running,status.phase!=Succeeded \
    -o wide 2>/dev/null | sed 's/^/    /' || true
else
  pass "No crash-looping pods in '${WS_NS}' namespace"
fi

# Check node readiness
not_ready=$(kubectl $CTX_FLAG get nodes --no-headers 2>/dev/null \
  | { grep -v " Ready" || true; } | wc -l)
if [[ "$not_ready" -gt 0 ]]; then
  warn "${not_ready} node(s) not in Ready state:"
  kubectl $CTX_FLAG get nodes --no-headers 2>/dev/null \
    | { grep -v " Ready" || true; } | sed 's/^/    /'
else
  pass "All nodes are Ready"
fi

# ════════════════════════════════════════════════════════════════════
# Summary
# ════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}══════════════════════════════════════════════${RESET}"
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}${BOLD}FAIL — ${ERRORS} blocking error(s), ${WARNINGS} warning(s)${RESET}"
  echo -e "Fix errors above before running: ${BOLD}task workspace:deploy ENV=${ENV}${RESET}"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}${BOLD}PASS with warnings — 0 errors, ${WARNINGS} warning(s)${RESET}"
  echo -e "Review warnings above, then: ${BOLD}task workspace:deploy ENV=${ENV}${RESET}"
else
  echo -e "${GREEN}${BOLD}ALL CHECKS PASSED — 0 errors, 0 warnings${RESET}"
  echo -e "Ready to run: ${BOLD}task workspace:deploy ENV=${ENV}${RESET}"
fi
echo -e "${BOLD}══════════════════════════════════════════════${RESET}\n"
