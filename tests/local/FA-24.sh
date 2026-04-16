#!/usr/bin/env bash
# FA-24: Kollaboratives Whiteboard — Nextcloud Whiteboard Deployment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/keycloak -- curl -s "$@" 2>/dev/null; }

# ── T1: Whiteboard pod running ──────────────────────────────────
WB_READY=$(kubectl get deploy whiteboard -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${WB_READY:-0}" "0" "FA-24" "T1" "Whiteboard-Pod running (readyReplicas > 0)"

# ── T2: Whiteboard service on port 3002 ─────────────────────────
WB_PORT=$(kubectl get svc whiteboard -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "0")
assert_eq "$WB_PORT" "3002" "FA-24" "T2" "Whiteboard Service auf Port 3002"

# ── T3: Whiteboard health endpoint reachable ────────────────────
WB_HEALTH=$(_kube_curl -o /dev/null -w '%{http_code}' "http://whiteboard:3002/")
assert_eq "$WB_HEALTH" "200" "FA-24" "T3" "Whiteboard erreichbar (HTTP 200)"

# ── T4: Whiteboard connects to Nextcloud ────────────────────────
WB_NC_URL=$(kubectl get deploy whiteboard -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].env}' 2>/dev/null \
  | jq -r '.[] | select(.name=="NEXTCLOUD_URL") | .value // ""')
assert_contains "$WB_NC_URL" "nextcloud" "FA-24" "T4" "Whiteboard NEXTCLOUD_URL konfiguriert"

# ── T5: JWT secret configured ───────────────────────────────────
WB_JWT=$(kubectl get deploy whiteboard -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].env}' 2>/dev/null \
  | jq -r '.[] | select(.name=="JWT_SECRET_KEY") | .valueFrom.secretKeyRef.key // ""')
assert_eq "$WB_JWT" "WHITEBOARD_JWT_SECRET" "FA-24" "T5" "Whiteboard JWT-Secret konfiguriert"

# ── T6: Nextcloud whiteboard app jwt_secret_key matches backend ─
# Prevents regression of "Problem mit Authentifizierungskonfiguration" where
# Nextcloud signs JWTs with a different (or empty) secret than the backend.
K8S_SECRET=$(kubectl get secret workspace-secrets -n "$NAMESPACE" \
  -o jsonpath='{.data.WHITEBOARD_JWT_SECRET}' 2>/dev/null | base64 -d || echo "")
NC_JWT=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
  su -s /bin/bash www-data -c "php occ config:app:get whiteboard jwt_secret_key" 2>/dev/null || echo "")
assert_eq "$NC_JWT" "$K8S_SECRET" "FA-24" "T6" "Nextcloud whiteboard.jwt_secret_key stimmt mit Backend ueberein"

