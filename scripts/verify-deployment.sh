#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# verify-deployment.sh — Post-deploy sanity check
#
# Probes critical cross-namespace network paths and validates key
# deployment state (secrets, credentials). Run after workspace:deploy
# + workspace:post-setup to catch silent failures before users do.
#
# Usage:  ENV=mentolder bash scripts/verify-deployment.sh
#         ENV=korczewski bash scripts/verify-deployment.sh
#         bash scripts/verify-deployment.sh           # defaults to dev
# ═══════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV="${ENV:-dev}"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-resolve.sh" "$ENV" "$SCRIPT_DIR/../environments"

NS="${WORKSPACE_NAMESPACE:-workspace}"
KUBE_CONTEXT="${ENV_CONTEXT:-}"
CTX_ARGS=()
[[ -n "$KUBE_CONTEXT" ]] && CTX_ARGS=(--context "$KUBE_CONTEXT")

# Derive website namespace from workspace namespace
if [[ "$NS" == "workspace" ]]; then
  WEB_NS="website"
else
  # workspace-korczewski → website-korczewski
  WEB_NS="website-${NS#workspace-}"
fi

PASS=0; FAIL=0; WARN=0
ALL_GOOD=true

# ── Colors ─────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BOLD=''; DIM=''; RESET=''
fi

pass()    { echo -e "  ${GREEN}✓${RESET} $*"; ((PASS++)); }
fail()    { echo -e "  ${RED}✗${RESET} $*"; ((FAIL++)); ALL_GOOD=false; }
warn()    { echo -e "  ${YELLOW}⚠${RESET} $*"; ((WARN++)); }
section() { echo -e "\n${BOLD}── $* ──${RESET}"; }

# ── Network probe: exec into existing pod ──────────────────────────────
# Uses bash /dev/tcp for TCP probes (no external tools needed)
# and wget for HTTP probes (available in Alpine/PHP images).
_first_pod() {
  local ns="$1" label="$2"
  kubectl get pods "${CTX_ARGS[@]}" -n "$ns" -l "app=$label" \
    --field-selector=status.phase=Running \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null
}

_tcp_probe() {
  local desc="$1" src_ns="$2" src_app="$3" host="$4" port="$5"
  local pod
  pod=$(_first_pod "$src_ns" "$src_app")
  if [[ -z "$pod" ]]; then
    warn "$desc  (no running pod: app=$src_app in $src_ns)"
    return
  fi
  if kubectl exec "${CTX_ARGS[@]}" -n "$src_ns" "$pod" -- \
       bash -c "echo '' > /dev/tcp/${host}/${port}" 2>/dev/null; then
    pass "$desc"
  else
    fail "$desc  (TCP ${host}:${port} from $src_ns/$pod)"
  fi
}

_http_probe() {
  local desc="$1" src_ns="$2" src_app="$3" url="$4"
  local pod
  pod=$(_first_pod "$src_ns" "$src_app")
  if [[ -z "$pod" ]]; then
    warn "$desc  (no running pod: app=$src_app in $src_ns)"
    return
  fi
  # Try wget first (Alpine/BusyBox), then curl (PHP/Debian images)
  if kubectl exec "${CTX_ARGS[@]}" -n "$src_ns" "$pod" -- \
       sh -c "wget -qO/dev/null --timeout=5 '$url' 2>/dev/null || \
              curl -sf --max-time 5 '$url' -o /dev/null 2>/dev/null"; then
    pass "$desc"
  else
    fail "$desc  ($url from $src_ns/$pod)"
  fi
}

# ── Secret check ──────────────────────────────────────────────────────
_secret_not_sealed() {
  local desc="$1" ns="$2" secret="$3" key="$4"
  local raw
  raw=$(kubectl get secret "$secret" "${CTX_ARGS[@]}" -n "$ns" \
    -o jsonpath="{.data.${key}}" 2>/dev/null | base64 -d 2>/dev/null || true)
  if [[ -z "$raw" ]]; then
    fail "$desc  (key ${key} missing from secret ${ns}/${secret})"
  elif [[ "$raw" == "SEALED" ]]; then
    fail "$desc  (key ${key} still holds literal 'SEALED' in ${ns}/${secret})"
  else
    pass "$desc"
  fi
}

_secret_exists() {
  local desc="$1" ns="$2" secret="$3"
  if kubectl get secret "$secret" "${CTX_ARGS[@]}" -n "$ns" \
       -o name >/dev/null 2>&1; then
    pass "$desc"
  else
    fail "$desc  (secret ${ns}/${secret} missing)"
  fi
}

# ══════════════════════════════════════════════════════════════════════
echo -e "${BOLD}Deployment Verification${RESET}  ${DIM}ENV=${ENV}  ns=${NS}  web-ns=${WEB_NS}${RESET}"

# ── 1. Cross-namespace network paths ──────────────────────────────────
section "Cross-namespace network paths"

if [[ "$ENV" != "dev" ]]; then
  # website pod → keycloak (OIDC callback — most critical path)
  _http_probe \
    "${WEB_NS} → keycloak:8080 (OIDC)" \
    "$WEB_NS" "website" \
    "http://keycloak.${NS}.svc.cluster.local:8080/realms/workspace/.well-known/openid-configuration"

  # workspace cronjobs → website API (billing, notify-unread, monthly-billing)
  _http_probe \
    "${NS} → website:4321 (cronjob API)" \
    "$NS" "nextcloud" \
    "http://website.${WEB_NS}.svc.cluster.local:4321/"

  # workspace → shared-db:5432 (all DB-backed services)
  _tcp_probe \
    "${NS} → shared-db:5432" \
    "$NS" "nextcloud" \
    "shared-db.${NS}.svc.cluster.local" "5432"

  # website → shared-db:5432 (website own DB)
  _tcp_probe \
    "${WEB_NS} → shared-db:5432" \
    "$WEB_NS" "website" \
    "shared-db.${NS}.svc.cluster.local" "5432"

  # For korczewski: also check cross-cluster path to mentolder's shared-db
  if [[ "$NS" == "workspace-korczewski" ]]; then
    _tcp_probe \
      "${NS} → shared-db.workspace:5432 (tracking-import)" \
      "$NS" "nextcloud" \
      "shared-db.workspace.svc.cluster.local" "5432"
  fi
else
  warn "ENV=dev — skipping cross-namespace probes (no NetPol in dev)"
fi

# ── 2. Secrets & credentials ──────────────────────────────────────────
section "Secrets & credentials"

_secret_exists \
  "workspace-secrets exists" \
  "$NS" "workspace-secrets"

_secret_not_sealed \
  "KC_USER1_PASSWORD not SEALED" \
  "$NS" "workspace-secrets" "KC_USER1_PASSWORD"

_secret_not_sealed \
  "KEYCLOAK_ADMIN_PASSWORD not SEALED" \
  "$NS" "workspace-secrets" "KEYCLOAK_ADMIN_PASSWORD"

if [[ "$NS" == "workspace-korczewski" ]]; then
  # website-korczewski has its own secrets secret
  _secret_exists \
    "website-secrets exists (${WEB_NS})" \
    "$WEB_NS" "website-secrets"
fi

# ── 3. Workloads running ──────────────────────────────────────────────
section "Workloads running"

_check_deploy() {
  local desc="$1" ns="$2" name="$3"
  local ready
  ready=$(kubectl get deployment "${CTX_ARGS[@]}" -n "$ns" "$name" \
    -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
  if [[ "${ready:-0}" -ge 1 ]]; then
    pass "$desc  (${ready} ready)"
  else
    fail "$desc  (0 ready replicas)"
  fi
}

_check_deploy "keycloak"   "$NS"     "keycloak"
_check_deploy "nextcloud"  "$NS"     "nextcloud"
_check_deploy "website"    "$WEB_NS" "website"
_check_deploy "shared-db"  "$NS"     "shared-db"

# ── Summary ───────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL + WARN))
echo ""
echo -e "${BOLD}── Summary ──${RESET}"
echo -e "  ${GREEN}✓ ${PASS} passed${RESET}  ${RED}✗ ${FAIL} failed${RESET}  ${YELLOW}⚠ ${WARN} skipped${RESET}  (${TOTAL} total)"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo -e "  ${RED}FAIL${RESET} — fix the items above before going live."
  echo -e "  Common causes:"
  echo -e "    • NetworkPolicy missing  →  check prod-korczewski/netpol-cross-namespace.yaml"
  echo -e "    • Credentials SEALED     →  run: task workspace:admin-users-setup ENV=${ENV}"
  echo -e "    • Pod not ready          →  run: task workspace:status ENV=${ENV}"
  exit 1
fi

echo -e "  ${GREEN}All checks passed.${RESET}  ${ENV} is ready."
