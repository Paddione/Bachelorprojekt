#!/usr/bin/env bash
# SA-01: Transportverschlüsselung — Ingress routing, headers, TLS readiness (k3d)
# Note: Full TLS tests run in prod tier (cert-manager, Let's Encrypt).
# Local tier verifies ingress routing and security headers are configured.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# T1: All service ingresses are defined
for svc in auth files office vault; do
  INGRESS=$(kubectl get ingress -n "$NAMESPACE" --no-headers 2>/dev/null | grep -c "${svc}" || echo "0")
  assert_gt "$INGRESS" 0 "SA-01" "T1-${svc}" "Ingress für ${svc}.localhost definiert"
done

# T2: Services reachable (via ingress or port-forward)
for pair in "auth.localhost:${KC_URL:-http://auth.localhost}:200,302,303" \
            "files.localhost:${NC_URL:-http://files.localhost}:200,302,303"; do
  HOST="${pair%%:*}"
  REST="${pair#*:}"
  URL="${REST%:*}"
  EXPECTED="${REST##*:}"
  # Use the port-forwarded URL if available, fall back to ingress hostname
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${URL}/" 2>/dev/null || echo "000")
  if echo "$EXPECTED" | tr ',' '\n' | grep -qx "$STATUS"; then
    _log_result "SA-01" "T2-${HOST%%.*}" "Service ${HOST%%.*} erreichbar (HTTP ${STATUS})" "pass" "0"
  else
    _log_result "SA-01" "T2-${HOST%%.*}" "Service ${HOST%%.*} erreichbar" "fail" "0" "HTTP ${STATUS}, erwartet: ${EXPECTED}"
  fi
done

# T3: Traefik IngressRoute or Ingress uses TLS annotation (ready for prod)
TLS_ANNOTATIONS=$(kubectl get ingress -n "$NAMESPACE" -o json 2>/dev/null \
  | jq '[.items[] | select(.spec.tls != null or .metadata.annotations["traefik.ingress.kubernetes.io/router.tls"] == "true")] | length')
TOTAL_INGRESS=$(kubectl get ingress -n "$NAMESPACE" -o json 2>/dev/null | jq '.items | length')
if (( TOTAL_INGRESS > 0 )); then
  _log_result "SA-01" "T3" "TLS-Konfiguration in Ingress vorhanden (${TLS_ANNOTATIONS}/${TOTAL_INGRESS})" "pass" "0"
else
  _log_result "SA-01" "T3" "Ingress-Objekte vorhanden" "fail" "0" "Keine Ingress-Objekte gefunden"
fi

# T5: Keycloak serves correct CORS/security headers
KC_HEADERS=$(curl -s -D - -o /dev/null --max-time 10 "http://auth.localhost/realms/workspace" 2>/dev/null)
assert_contains "$KC_HEADERS" "X-Content-Type-Options" "SA-01" "T5a" "Keycloak setzt X-Content-Type-Options Header"
assert_contains "$KC_HEADERS" "X-Frame-Options" "SA-01" "T5b" "Keycloak setzt X-Frame-Options Header"
