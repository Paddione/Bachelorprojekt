#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# check-connectivity.sh — Test HTTPS reachability of all workspace services
# ═══════════════════════════════════════════════════════════════════
# Usage: bash scripts/check-connectivity.sh [ENV]
#        bash scripts/check-connectivity.sh korczewski
#        bash scripts/check-connectivity.sh          # defaults to dev
# ═══════════════════════════════════════════════════════════════════
set -uo pipefail

ENV="${1:-dev}"
TIMEOUT=10
PASS=0
FAIL=0

# ── Colors ────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'; DIM='\033[2m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''; DIM=''
fi

pass()    { echo -e "  ${GREEN}✓${RESET} $*"; ((PASS++)); }
fail()    { echo -e "  ${RED}✗${RESET} $*"; ((FAIL++)); }
warn()    { echo -e "  ${YELLOW}⚠${RESET} $*"; }
section() { echo -e "\n${BOLD}── $* ──${RESET}"; }

# ── Resolve domain + scheme ───────────────────────────────────────
if [[ "$ENV" == "dev" ]]; then
  DOMAIN="localhost"
  SCHEME="http"
else
  ENV_FILE="environments/${ENV}.yaml"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo -e "${RED}ERROR:${RESET} Environment file not found: ${ENV_FILE}" >&2
    exit 1
  fi
  DOMAIN=$(grep -E '^[[:space:]]*domain:' "$ENV_FILE" | head -1 \
    | sed 's/^[^:]*:[[:space:]]*//' | tr -d '"'"'" | tr -d '[:space:]')
  if [[ -z "$DOMAIN" ]]; then
    echo -e "${RED}ERROR:${RESET} Could not read domain from ${ENV_FILE}" >&2
    exit 1
  fi
  SCHEME="https"
fi

# ── Service list ──────────────────────────────────────────────────
# Format: "label|subdomain|path|acceptable_http_codes"
# Codes: comma-separated; any listed code = reachable (200,301,302,401,403 typical)
declare -a SERVICES=(
  "Keycloak|auth|/|200,301,302"
  "Nextcloud|files|/|200,301,302"
  "Vaultwarden|vault|/|200,301,302"
  "DocuSeal|sign|/|200,301,302"
  "Tracking|tracking|/|200,301,302"
  "Website|web|/|200,301,302"
  "Docs|docs|/|200,301,302,401,403"
  "Brett|brett|/|200,301,302"
  "Traefik|traefik|/dashboard/|200,301,302"
  "Collabora|office|/|200,301,302"
  "Whiteboard|board|/|200,301,302"
  "Talk Signaling|signaling|/|200,301,302,404"
  "Mailpit|mail|/|200,301,302"
)

# ── Check helper ──────────────────────────────────────────────────
check_service() {
  local label="$1" subdomain="$2" path="$3" ok_codes="$4"

  local url
  if [[ "$ENV" == "dev" ]]; then
    url="${SCHEME}://${subdomain}.${DOMAIN}${path}"
  else
    url="${SCHEME}://${subdomain}.${DOMAIN}${path}"
  fi

  local code
  local resolve_args=()
  if [[ "$ENV" == "dev" ]]; then
    resolve_args=(--resolve "${subdomain}.${DOMAIN}:80:127.0.0.1" --resolve "${subdomain}.${DOMAIN}:443:127.0.0.1")
  fi

  code=$(curl -sk --max-time "$TIMEOUT" -o /dev/null -w "%{http_code}" \
    "${resolve_args[@]}" \
    "$url" 2>/dev/null || echo "000")

  local padded
  padded=$(printf "%-22s" "$label")

  if [[ "$code" == "000" ]]; then
    fail "${padded} ${DIM}${url}${RESET}  ${RED}(timeout / unreachable)${RESET}"
  elif echo "$ok_codes" | grep -qw "$code"; then
    pass "${padded} ${DIM}${url}${RESET}  ${GREEN}HTTP ${code}${RESET}"
  else
    fail "${padded} ${DIM}${url}${RESET}  ${RED}HTTP ${code}${RESET}"
  fi
}

# ── Main ──────────────────────────────────────────────────────────
echo -e "${BOLD}Workspace Connectivity Check${RESET}  ${CYAN}ENV=${ENV}  domain=${DOMAIN}${RESET}"

section "Core Services"
check_service "Keycloak"       "auth"       "/"            "200,301,302"
check_service "Nextcloud"      "files"      "/"            "200,301,302"
check_service "Vaultwarden"    "vault"      "/"            "200,301,302"
check_service "DocuSeal"       "sign"       "/"            "200,301,302"

check_service "Website"        "web"        "/"            "200,301,302"
check_service "Docs"           "docs"       "/"            "200,301,302,401,403"

section "Optional Services"
check_service "Brett"          "brett"      "/"            "200,301,302"
check_service "Collabora"      "office"     "/"            "200,301,302"
check_service "Whiteboard"     "board"      "/"            "200,301,302"
check_service "Talk Signaling" "signaling"  "/"            "200,301,302,404"
check_service "Mailpit"        "mail"       "/"            "200,301,302,401"

section "Infrastructure"
check_service "Traefik"        "traefik"    "/"            "200,301,302,401,404"

# ── Summary ───────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL))
echo -e "\n${BOLD}── Summary ──${RESET}"
echo -e "  ${GREEN}✓ ${PASS}/${TOTAL} reachable${RESET}  ${RED}✗ ${FAIL}/${TOTAL} unreachable${RESET}"

if [[ $FAIL -gt 0 ]]; then
  echo -e "\n  ${YELLOW}Note:${RESET} unreachable services may be optional or not yet deployed."
  exit 1
fi
