#!/usr/bin/env bash
# FA-14: User Registration Flow — Website Registration Page
# Tests: Registration page loads, Astro components exist
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

WEB_NAMESPACE="${WEB_NAMESPACE:-website}"

# ── T1: Website pod running ──────────────────────────────────────
WEB_READY=$(kubectl get deployment website -n "$WEB_NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$WEB_READY" 0 "FA-14" "T1" "Website-Deployment laeuft (readyReplicas > 0)"

# ── T2: Registration page reachable ──────────────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  HTTP_CODE=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    wget -qO /dev/null -S --spider http://localhost:4321/registrieren 2>&1 | grep "HTTP/" | awk '{print $2}' || echo "0")
  assert_eq "$HTTP_CODE" "200" "FA-14" "T2" "Registrierungsseite antwortet auf HTTP (Status ${HTTP_CODE})"
else
  skip_test "FA-14" "T2" "Registrierungsseite HTTP-Antwort" "Website nicht bereit"
fi

# ── T3: Check for registration form fields in HTML ────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  HTML=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- wget -qO- http://localhost:4321/registrieren 2>/dev/null)
  assert_contains "$HTML" "Vorname" "FA-14" "T3a" "HTML enthaelt Feld 'Vorname'"
  assert_contains "$HTML" "Nachname" "FA-14" "T3b" "HTML enthaelt Feld 'Nachname'"
  assert_contains "$HTML" "E-Mail" "FA-14" "T3c" "HTML enthaelt Feld 'E-Mail'"
else
  skip_test "FA-14" "T3" "Formularfelder" "Website nicht bereit"
fi

assert_summary
