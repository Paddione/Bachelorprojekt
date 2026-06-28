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

# ── Banner ────────────────────────────────────────────────────────
echo -e "\n${BOLD}workspace pre-deploy-check  ENV=${ENV}${RESET}"

IS_DEV=false
[[ "$ENV" == "dev" ]] && IS_DEV=true

PLACEHOLDERS="yourdomain\.tld|yourbrand\.tld|info@yourdomain\.tld|MANAGED_EXTERNALLY|REPLACE_ME|FILL_FROM_ENV|FILL_ME"

# Source the check functions library
# Since this script may be run from workspace root, check path
if [[ -f "scripts/pre-deploy-checks-lib.sh" ]]; then
  source scripts/pre-deploy-checks-lib.sh
else
  source "$(dirname "${BASH_SOURCE[0]}")/pre-deploy-checks-lib.sh"
fi

check_tools
check_env_schema
check_sealed_secrets
check_kustomize
check_connectivity
check_sealed_controller
check_network_policies
check_envsubst_vars
check_cluster_health

# Summary
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
