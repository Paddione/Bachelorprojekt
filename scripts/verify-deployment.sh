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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV="${ENV:-dev}"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-resolve.sh" "$ENV" "$SCRIPT_DIR/../environments"

# env-resolve.sh enables set -euo pipefail in the current shell; we want
# explicit error handling throughout this script, so reset after source.
set +e
set -uo pipefail

NS="${WORKSPACE_NAMESPACE:-workspace}"
KUBE_CONTEXT="${ENV_CONTEXT:-}"
CTX_ARGS=()
[[ -n "$KUBE_CONTEXT" ]] && CTX_ARGS=(--context "$KUBE_CONTEXT")

WEB_NS="${WEBSITE_NAMESPACE:-website}"

PASS=0; FAIL=0; WARN=0

# ── Colors ─────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BOLD=''; DIM=''; RESET=''
fi

pass()    { echo -e "  ${GREEN}✓${RESET} $*"; PASS=$((PASS+1)); }
fail()    { echo -e "  ${RED}✗${RESET} $*"; FAIL=$((FAIL+1)); }
warn()    { echo -e "  ${YELLOW}⚠${RESET} $*"; WARN=$((WARN+1)); }
section() { echo -e "\n${BOLD}── $* ──${RESET}"; }

# ── Network probe helpers ──────────────────────────────────────────────
_first_pod() {
  local ns="$1" label="$2"
  kubectl get pods "${CTX_ARGS[@]}" -n "$ns" -l "app=$label" \
    --field-selector=status.phase=Running \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true
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
    fail "$desc  (TCP ${host}:${port} unreachable from $src_ns)"
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
    fail "$desc  ($url unreachable from $src_ns)"
  fi
}

# ── Secret checks ─────────────────────────────────────────────────────
_secret_not_sealed() {
  local desc="$1" ns="$2" secret="$3" key="$4"
  local raw
  raw=$(kubectl get secret "$secret" "${CTX_ARGS[@]}" -n "$ns" \
    -o "jsonpath={.data.${key}}" 2>/dev/null | base64 -d 2>/dev/null) || raw=""
  if [[ -z "$raw" ]]; then
    fail "$desc  (key ${key} missing from ${ns}/${secret})"
  elif [[ "$raw" == "SEALED" ]]; then
    fail "$desc  (${key} is still the literal string 'SEALED' — run workspace:admin-users-setup)"
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
    fail "$desc  (${ns}/${secret} not found)"
  fi
}

# Compare a key across two secrets WITHOUT printing the value. Catches the
# stale-copy drift class from T001438: a live rotation updates
# workspace-secrets but the website-namespace copy keeps the old value.
_secret_key_in_sync() {
  local desc="$1" ns_a="$2" secret_a="$3" ns_b="$4" secret_b="$5" key_a="$6" key_b="${7:-$6}"
  local a b
  a=$(kubectl get secret "$secret_a" "${CTX_ARGS[@]}" -n "$ns_a" \
    -o "jsonpath={.data.${key_a//./\\.}}" 2>/dev/null) || a=""
  
  if ! kubectl get secret "$secret_b" "${CTX_ARGS[@]}" -n "$ns_b" >/dev/null 2>&1; then
    if [[ "$ENV" == "dev" ]]; then
      pass "$desc  (skipped: target secret ${ns_b}/${secret_b} not found in dev)"
      return
    else
      fail "$desc  (target secret ${ns_b}/${secret_b} not found)"
      return
    fi
  fi

  b=$(kubectl get secret "$secret_b" "${CTX_ARGS[@]}" -n "$ns_b" \
    -o "jsonpath={.data.${key_b//./\\.}}" 2>/dev/null) || b=""
  if [[ -z "$a" && -z "$b" ]]; then
    pass "$desc  (both empty/absent)"
  elif [[ -z "$a" ]]; then
    fail "$desc  (${key_a} missing in ${ns_a}/${secret_a})"
  elif [[ -z "$b" ]]; then
    fail "$desc  (${key_b} missing in ${ns_b}/${secret_b})"
  elif [[ "$a" == "$b" ]]; then
    pass "$desc"
  else
    fail "$desc  (${key_a} ↔ ${key_b} differs — stale copy; sync environments/.secrets, env:seal, re-apply)"
  fi
}

# End-to-end client-secret probe: exercise pocket-id's token endpoint from
# inside the website pod with its *runtime env* secret and a dummy code.
# "Invalid authorization code" proves client auth passed; "invalid client
# secret" is exactly the login-breaking mismatch (also catches a correct
# k8s Secret with a stale, not-yet-restarted pod).
_pocket_id_client_auth() {
  local desc="$1"
  if ! kubectl get deployment website "${CTX_ARGS[@]}" -n "$WEB_NS" >/dev/null 2>&1; then
    warn "$desc  (skipped: website deployment not found in $WEB_NS)"
    return
  fi
  local out
  out=$(kubectl exec "${CTX_ARGS[@]}" -n "$WEB_NS" deploy/website -- node -e "
const p = new URLSearchParams({grant_type:'authorization_code',code:'verify-probe',
  client_id:'website',client_secret:process.env.POCKET_ID_WEBSITE_SECRET,
  redirect_uri:'https://verify.invalid/api/auth/callback'});
fetch('http://pocket-id.${NS}.svc.cluster.local:1411/api/oidc/token',
  {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p})
  .then(async r=>console.log(await r.text())).catch(e=>console.log('PROBE_ERROR '+e.message));
" 2>/dev/null) || out="PROBE_ERROR exec failed"
  case "$out" in
    *"Invalid authorization code"*) pass "$desc" ;;
    *"invalid client secret"*|*"Invalid client secret"*)
      fail "$desc  (pocket-id rejects the website pod's client secret — secret mismatch)" ;;
    *) warn "$desc  (inconclusive: ${out:0:80})" ;;
  esac
}

# ── Deployment readiness ───────────────────────────────────────────────
_check_deploy() {
  local desc="$1" ns="$2" name="$3"
  local ready
  ready=$(kubectl get deployment "${CTX_ARGS[@]}" -n "$ns" "$name" \
    -o jsonpath='{.status.readyReplicas}' 2>/dev/null) || ready=""
  ready="${ready:-0}"
  if [[ "$ready" -ge 1 ]]; then
    pass "$desc  (${ready} ready)"
  else
    fail "$desc  (0 ready replicas in $ns)"
  fi
}

# ══════════════════════════════════════════════════════════════════════
echo -e "${BOLD}Deployment Verification${RESET}  ${DIM}ENV=${ENV}  ns=${NS}  web-ns=${WEB_NS}${RESET}"

# ── 1. Cross-namespace network paths ──────────────────────────────────
section "Cross-namespace network paths"

if [[ "$ENV" != "dev" ]]; then
  # website pod → pocket-id (OIDC callback)
  _http_probe \
    "${WEB_NS} → pocket-id:1411 (OIDC)" \
    "$WEB_NS" "website" \
    "http://pocket-id.${NS}.svc.cluster.local:1411/.well-known/openid-configuration"

  # workspace cronjobs → website API (billing, notify-unread, monthly-billing)
  _http_probe \
    "${NS} → website:80 (cronjob API)" \
    "$NS" "nextcloud" \
    "http://website.${WEB_NS}.svc.cluster.local/"

  # workspace → shared-db:5432
  _tcp_probe \
    "${NS} → shared-db:5432" \
    "$NS" "nextcloud" \
    "shared-db.${NS}.svc.cluster.local" "5432"

  # website → shared-db:5432
  _tcp_probe \
    "${WEB_NS} → shared-db:5432" \
    "$WEB_NS" "website" \
    "shared-db.${NS}.svc.cluster.local" "5432"

else
  warn "ENV=dev — skipping cross-namespace probes (NetworkPolicy not active in dev)"
fi

# ── 2. Secrets & credentials ──────────────────────────────────────────
section "Secrets & credentials"

_secret_exists       "workspace-secrets exists"         "$NS"     "workspace-secrets"
_secret_not_sealed   "KC_USER1_PASSWORD not SEALED"     "$NS"     "workspace-secrets" "KC_USER1_PASSWORD"

if [[ "$NS" == "workspace-korczewski" || "$ENV" != "dev" ]]; then
  _secret_exists     "website-secrets exists (${WEB_NS})" "$WEB_NS" "website-secrets"
fi

# Check all extra namespace secrets from schema dynamically
if command -v python3 >/dev/null 2>&1 && python3 -c "import yaml" >/dev/null 2>&1; then
  # Determine current brand (defaulting to mentolder for dev)
  brand="${BRAND_ID:-mentolder}"
  brand_lc="${brand,,}"

  mappings=$(BRAND_LC="$brand_lc" WORKSPACE_NS="$NS" WEBSITE_NS="$WEB_NS" SCHEMA="$SCRIPT_DIR/../environments/schema.yaml" python3 <<'PY'
import os, yaml
brand_lc = os.environ.get("BRAND_LC", "mentolder")
workspace_ns = os.environ.get("WORKSPACE_NS", "workspace")
website_ns = os.environ.get("WEBSITE_NS", "website")
ns_remap = {"workspace": workspace_ns, "website": website_ns}

with open(os.environ["SCHEMA"]) as f:
    schema = yaml.safe_load(f) or {}

for entry in schema.get("secrets") or []:
    src = entry["name"]
    for mapping in entry.get("extra_namespaces") or []:
        owner_brand = mapping.get("owner_brand") or []
        if owner_brand and all(str(b).lower() != brand_lc for b in owner_brand):
            continue
        ns = ns_remap.get(mapping["namespace"], mapping["namespace"])
        sec = mapping["secret"]
        dest = mapping.get("dest_key") or src
        print(f"{src}\t{ns}\t{sec}\t{dest}")
PY
)

  while IFS=$'\t' read -r src_key target_ns target_secret dest_key; do
    [[ -z "$src_key" ]] && continue
    # Verify that the value in workspace-secrets (src_key) matches target_secret (dest_key)
    _secret_key_in_sync "Secret key sync: ${src_key} (${NS}/workspace-secrets) ↔ ${dest_key} (${target_ns}/${target_secret})" \
      "$NS" "workspace-secrets" "$target_ns" "$target_secret" "$src_key" "$dest_key"
  done <<< "$mappings"
fi

_pocket_id_client_auth "pocket-id accepts website client secret (runtime env)"

# ── 3. Workloads running ──────────────────────────────────────────────
section "Workloads running"

_check_deploy "pocket-id"  "$NS"     "pocket-id"
_check_deploy "nextcloud"  "$NS"     "nextcloud"
if [[ "$ENV" != "dev" ]]; then
  _check_deploy "website"    "$WEB_NS" "website"
else
  if kubectl get deployment mentolder-web "${CTX_ARGS[@]}" -n "$NS" >/dev/null 2>&1; then
    _check_deploy "mentolder-web" "$NS" "mentolder-web"
  else
    warn "website  (skipped in dev)"
  fi
fi
_check_deploy "shared-db"  "$NS"     "shared-db"

# ── Summary ───────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL + WARN))
echo ""
echo -e "${BOLD}── Summary ──${RESET}"
echo -e "  ${GREEN}✓ ${PASS} passed${RESET}  ${RED}✗ ${FAIL} failed${RESET}  ${YELLOW}⚠ ${WARN} skipped${RESET}  (${TOTAL} total)"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo -e "  ${RED}FAIL${RESET} — fix the items above before going live."
  echo -e "  Common causes:"
  echo -e "    • NetworkPolicy gap      →  check prod-korczewski/netpol-cross-namespace.yaml"
  echo -e "    • Credentials SEALED     →  task workspace:admin-users-setup ENV=${ENV}"
  echo -e "    • Pod not ready          →  task workspace:status ENV=${ENV}"
  exit 1
fi

echo -e "  ${GREEN}All checks passed.${RESET}  ${ENV} is ready."
