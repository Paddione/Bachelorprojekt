#!/usr/bin/env bash
# FA-25: Mailpit E-Mail-Server — SMTP Relay and Web UI
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/keycloak -- curl -s "$@" 2>/dev/null; }

# ── T1: Mailpit pod running ─────────────────────────────────────
MP_READY=$(kubectl get deploy mailpit -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${MP_READY:-0}" "0" "FA-25" "T1" "Mailpit-Pod running (readyReplicas > 0)"

# ── T2: Mailpit web UI reachable (port 8025) ────────────────────
MP_WEB=$(_kube_curl -o /dev/null -w '%{http_code}' "http://mailpit:8025/")
assert_eq "$MP_WEB" "200" "FA-25" "T2" "Mailpit Web-UI erreichbar (HTTP 200)"

# ── T3: Mailpit SMTP port reachable (1025) ──────────────────────
SMTP_CHECK=$(kubectl exec -n "$NAMESPACE" deploy/keycloak -- \
  sh -c 'echo QUIT | nc -w 2 mailpit 1025 2>/dev/null | head -1')
assert_contains "$SMTP_CHECK" "220" "FA-25" "T3" "Mailpit SMTP auf Port 1025 erreichbar (Banner 220)"

# ── T4: Mailpit service exposes SMTP and HTTP ports ──────────────
MP_PORTS=$(kubectl get svc mailpit -n "$NAMESPACE" -o jsonpath='{.spec.ports[*].port}' 2>/dev/null)
assert_contains "$MP_PORTS" "1025" "FA-25" "T4a" "Mailpit Service exponiert SMTP-Port 1025"
assert_contains "$MP_PORTS" "8025" "FA-25" "T4b" "Mailpit Service exponiert HTTP-Port 8025"

# ── T5: Mailpit API reachable ───────────────────────────────────
MP_API=$(_kube_curl -o /dev/null -w '%{http_code}' "http://mailpit:8025/api/v1/messages?limit=1")
assert_eq "$MP_API" "200" "FA-25" "T5" "Mailpit API erreichbar (/api/v1/messages)"

# ── T6: Vaultwarden uses Mailpit as SMTP ────────────────────────
VW_SMTP=$(kubectl get deploy vaultwarden -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].env}' 2>/dev/null \
  | jq -r '.[] | select(.name=="SMTP_HOST") | .value // ""')
assert_eq "$VW_SMTP" "mailpit" "FA-25" "T6" "Vaultwarden nutzt Mailpit als SMTP"

