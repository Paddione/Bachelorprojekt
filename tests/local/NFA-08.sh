#!/usr/bin/env bash
# NFA-08: Produktions-Deployment (Hetzner) — k3s, TLS, cert-manager (local tier checks)
# Note: Full prod checks run in prod tier. Local tier verifies prod overlay and manifests exist.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

PROJECT_DIR="${SCRIPT_DIR}/.."

# ── T1: prod/ overlay directory exists ──────────────────────────
assert_eq "$(test -d "${PROJECT_DIR}/prod" && echo "exists" || echo "missing")" "exists" \
  "NFA-08" "T1" "prod/ Overlay-Verzeichnis vorhanden"

# ── T2: prod kustomization or patch files exist ─────────────────
PROD_FILES=$(find "${PROJECT_DIR}/prod" -name '*.yaml' -type f 2>/dev/null | wc -l | tr -d '[:space:]')
assert_gt "$PROD_FILES" "0" "NFA-08" "T2" "Produktions-Patches vorhanden (${PROD_FILES} YAML-Dateien)"

# ── T3: cert-manager manifests or Taskfile targets exist ─────────
if grep -q "cert:" "${PROJECT_DIR}/Taskfile.yml" 2>/dev/null; then
  _log_result "NFA-08" "T3" "cert-manager Tasks in Taskfile vorhanden" "pass" "0"
else
  _log_result "NFA-08" "T3" "cert-manager Tasks in Taskfile vorhanden" "fail" "0" "Kein cert: Task gefunden"
fi

# ── T4: DDNS updater manifest exists ────────────────────────────
assert_eq "$(test -f "${PROJECT_DIR}/prod/ddns-updater.yaml" && echo "exists" || echo "missing")" "exists" \
  "NFA-08" "T4" "DDNS-Updater Manifest vorhanden"

# ── T5: .env or domain config supports PROD_DOMAIN ──────────────
if grep -q "PROD_DOMAIN" "${PROJECT_DIR}/.env" 2>/dev/null || \
   grep -q "PROD_DOMAIN" "${PROJECT_DIR}/Taskfile.yml" 2>/dev/null; then
  _log_result "NFA-08" "T5" "PROD_DOMAIN konfigurierbar" "pass" "0"
else
  _log_result "NFA-08" "T5" "PROD_DOMAIN konfigurierbar" "fail" "0" "PROD_DOMAIN nicht in .env oder Taskfile"
fi

# ── T6: No proprietary cloud dependencies in manifests ──────────
ALL_IMAGES=$(kubectl get pods -n "${NAMESPACE:-workspace}" -o jsonpath='{.items[*].spec.containers[*].image}' 2>/dev/null)
for suspect in "amazonaws.com" "azurecr.io" "mcr.microsoft.com"; do
  assert_not_contains "$ALL_IMAGES" "$suspect" "NFA-08" "T6-${suspect%%.*}" "Keine Images von ${suspect}"
done

