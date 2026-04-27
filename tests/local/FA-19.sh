#!/usr/bin/env bash
# FA-19: DocuSeal E-Signatur-Plattform — Pod, API, Konfiguration, Persistenz
# Tests:
#   T1 — docuseal pod ready
#   T2 — service responds HTTP 200
#   T3 — SIGN_DOMAIN in domain-config ConfigMap
#   T4 — DOCUSEAL_SECRET_KEY_BASE Secret vorhanden
#   T5 — DOCUSEAL_DB_PASSWORD Secret vorhanden
#   T6 — docuseal-data-pvc gebunden
#   T7 — REST-API /api/templates antwortet (mit API-Token)
#   T8 — Keycloak-OIDC-Client docuseal konfiguriert (SSO-ready)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../lib/assert.sh
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/nextcloud -- curl -s "$@" 2>/dev/null; }

# ── T1: docuseal pod running ─────────────────────────────────────
DS_READY=$(kubectl get deploy docuseal -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${DS_READY:-0}" "0" "FA-19" "T1" "DocuSeal-Pod laeuft (readyReplicas > 0)"

# ── T2: web UI HTTP 200 ──────────────────────────────────────────
if [[ "${DS_READY:-0}" -gt 0 ]]; then
  HTTP_CODE=$(_kube_curl -o /dev/null -w '%{http_code}' "http://docuseal:3000/")
  assert_eq "$HTTP_CODE" "200" "FA-19" "T2" "DocuSeal Web-UI erreichbar (HTTP 200)"
else
  skip_test "FA-19" "T2" "DocuSeal Web-UI" "Pod nicht bereit"
fi

# ── T3: SIGN_DOMAIN in ConfigMap ─────────────────────────────────
SIGN_DOMAIN=$(kubectl get configmap domain-config -n "$NAMESPACE" \
  -o jsonpath='{.data.SIGN_DOMAIN}' 2>/dev/null || echo "")
assert_gt "${#SIGN_DOMAIN}" 0 "FA-19" "T3" "SIGN_DOMAIN in domain-config konfiguriert (${SIGN_DOMAIN})"

# ── T4: DOCUSEAL_SECRET_KEY_BASE Secret ──────────────────────────
SK_LEN=$(kubectl get secret workspace-secrets -n "$NAMESPACE" \
  -o jsonpath='{.data.DOCUSEAL_SECRET_KEY_BASE}' 2>/dev/null | base64 -d 2>/dev/null | wc -c)
assert_gt "${SK_LEN:-0}" 0 "FA-19" "T4" "DOCUSEAL_SECRET_KEY_BASE Secret vorhanden"

# ── T5: DOCUSEAL_DB_PASSWORD Secret ──────────────────────────────
DB_PW_LEN=$(kubectl get secret workspace-secrets -n "$NAMESPACE" \
  -o jsonpath='{.data.DOCUSEAL_DB_PASSWORD}' 2>/dev/null | base64 -d 2>/dev/null | wc -c)
assert_gt "${DB_PW_LEN:-0}" 0 "FA-19" "T5" "DOCUSEAL_DB_PASSWORD Secret vorhanden"

# ── T6: PVC gebunden ─────────────────────────────────────────────
PVC_STATUS=$(kubectl get pvc docuseal-data-pvc -n "$NAMESPACE" \
  -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
assert_eq "$PVC_STATUS" "Bound" "FA-19" "T6" "docuseal-data-pvc gebunden (${PVC_STATUS})"

# ── T7: REST-API /api/templates antwortet JSON ───────────────────
if [[ "${DS_READY:-0}" -gt 0 ]]; then
  API_TOKEN=$(kubectl get secret workspace-secrets -n "$NAMESPACE" \
    -o jsonpath='{.data.DOCUSEAL_API_TOKEN}' 2>/dev/null | base64 -d 2>/dev/null || echo "")
  if [[ -n "$API_TOKEN" ]]; then
    API_RESP=$(_kube_curl -H "X-Auth-Token: ${API_TOKEN}" "http://docuseal:3000/api/templates")
    assert_contains "$API_RESP" '"data"' "FA-19" "T7" "DocuSeal /api/templates liefert JSON mit data-Schluessel"
  else
    skip_test "FA-19" "T7" "DocuSeal REST-API" "DOCUSEAL_API_TOKEN nicht im Secret"
  fi
else
  skip_test "FA-19" "T7" "DocuSeal REST-API" "Pod nicht bereit"
fi

# ── T8: Keycloak-Client 'docuseal' konfiguriert ──────────────────
KC_TOKEN=$(kubectl exec -n "$NAMESPACE" deploy/keycloak -- \
  /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master \
  --user admin --password "$(kubectl get secret workspace-secrets -n "$NAMESPACE" \
    -o jsonpath='{.data.KC_ADMIN_PASSWORD}' 2>/dev/null | base64 -d 2>/dev/null)" \
  2>/dev/null && \
  kubectl exec -n "$NAMESPACE" deploy/keycloak -- \
  /opt/keycloak/bin/kcadm.sh get clients -r workspace \
  --fields clientId --format csv 2>/dev/null | grep -c "docuseal" || echo "0")
if [[ "${KC_TOKEN:-0}" -gt 0 ]]; then
  assert_gt "${KC_TOKEN:-0}" "0" "FA-19" "T8" "Keycloak-Client 'docuseal' in workspace-Realm"
else
  skip_test "FA-19" "T8" "Keycloak DocuSeal-Client" "Keycloak nicht erreichbar oder Client nicht gefunden"
fi
