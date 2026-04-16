#!/usr/bin/env bash
# FA-13: Dokumentation — Docs-Service Infrastruktur
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# ── T1: Docs service running ─────────────────────────────────────
DOCS_READY=$(kubectl get deployment docs -n "$NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${DOCS_READY:-0}" "0" "FA-13" "T1" "Docs-Deployment laeuft (readyReplicas > 0)"

# ── T2: docs.localhost reachable via ingress ─────────────────────
DOCS_STATUS=$(kubectl exec -n "$NAMESPACE" deploy/keycloak -- \
  curl -s -o /dev/null -w '%{http_code}' http://docs.workspace.svc.cluster.local 2>/dev/null || echo "0")
assert_gt "${DOCS_STATUS:-0}" "0" "FA-13" "T2" "Docs-Service intern erreichbar"

# ── T3: DOCS_DOMAIN in domain-config ─────────────────────────────
DOCS_DOMAIN=$(kubectl get configmap domain-config -n "$NAMESPACE" -o jsonpath='{.data.DOCS_DOMAIN}' 2>/dev/null)
assert_contains "$DOCS_DOMAIN" "localhost" "FA-13" "T3" "DOCS_DOMAIN in domain-config gesetzt (${DOCS_DOMAIN})"

assert_summary
