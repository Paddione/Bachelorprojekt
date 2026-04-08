#!/usr/bin/env bash
# SA-10: MCP-Endpunkt-Absicherung — ForwardAuth Token Validation
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
MCP_NS="${MCP_NAMESPACE:-workspace}"
_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/mattermost -- curl -s "$@" 2>/dev/null; }

AUTH_URL="http://mcp-auth-proxy.${MCP_NS}.svc"

# ── T1: ForwardAuth proxy pod running ───────────────────────────
PROXY_READY=$(kubectl get deploy mcp-auth-proxy -n "$MCP_NS" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${PROXY_READY:-0}" "0" "SA-10" "T1" "ForwardAuth-Proxy running (readyReplicas > 0)"

# ── T2: Request without Authorization header → 401 ──────────────
NO_AUTH=$(_kube_curl -o /dev/null -w '%{http_code}' "${AUTH_URL}/auth")
assert_eq "$NO_AUTH" "401" "SA-10" "T2" "Anfrage ohne Authorization-Header → HTTP 401"

# ── T3: Request with invalid token → 401 ────────────────────────
BAD_TOKEN=$(_kube_curl -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer totally-invalid-token" "${AUTH_URL}/auth")
assert_eq "$BAD_TOKEN" "401" "SA-10" "T3" "Anfrage mit ungültigem Token → HTTP 401"

# ── T4: Request with valid cluster token → 200 ──────────────────
CLUSTER_TOKEN=$(kubectl get secret mcp-tokens -n "$MCP_NS" -o jsonpath='{.data.CLUSTER_TOKEN}' 2>/dev/null | base64 -d)
if [[ -n "$CLUSTER_TOKEN" ]]; then
  GOOD_CLUSTER=$(_kube_curl -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${CLUSTER_TOKEN}" "${AUTH_URL}/auth")
  assert_eq "$GOOD_CLUSTER" "200" "SA-10" "T4" "Cluster-Token → HTTP 200"
else
  skip_test "SA-10" "T4" "Cluster-Token Validierung" "CLUSTER_TOKEN nicht in mcp-tokens"
fi

# ── T5: Request with valid business token → 200 (allowed path) ──
BUSINESS_TOKEN=$(kubectl get secret mcp-tokens -n "$MCP_NS" -o jsonpath='{.data.BUSINESS_TOKEN}' 2>/dev/null | base64 -d)
if [[ -n "$BUSINESS_TOKEN" ]]; then
  GOOD_BIZ=$(_kube_curl -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${BUSINESS_TOKEN}" \
    -H "X-Forwarded-Uri: /mattermost/test" \
    "${AUTH_URL}/auth")
  assert_eq "$GOOD_BIZ" "200" "SA-10" "T5" "Business-Token mit erlaubtem Pfad → HTTP 200"
else
  skip_test "SA-10" "T5" "Business-Token Validierung" "BUSINESS_TOKEN nicht in mcp-tokens"
fi

# ── T6: Business token forbidden on cluster-only path ────────────
if [[ -n "$BUSINESS_TOKEN" ]]; then
  FORBIDDEN=$(_kube_curl -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${BUSINESS_TOKEN}" \
    -H "X-Forwarded-Uri: /kubernetes/pods" \
    "${AUTH_URL}/auth")
  assert_eq "$FORBIDDEN" "403" "SA-10" "T6" "Business-Token auf Cluster-Pfad → HTTP 403"
else
  skip_test "SA-10" "T6" "Business-Token Pfadbeschränkung" "BUSINESS_TOKEN nicht in mcp-tokens"
fi

# ── T7: mcp-tokens Secret exists with both keys ─────────────────
TOKEN_KEYS=$(kubectl get secret mcp-tokens -n "$MCP_NS" -o jsonpath='{.data}' 2>/dev/null | jq -r 'keys[]' 2>/dev/null | sort | tr '\n' ',')
assert_contains "$TOKEN_KEYS" "BUSINESS_TOKEN" "SA-10" "T7a" "mcp-tokens enthält BUSINESS_TOKEN"
assert_contains "$TOKEN_KEYS" "CLUSTER_TOKEN" "SA-10" "T7b" "mcp-tokens enthält CLUSTER_TOKEN"

# ── T8: No IP allowlist middleware on MCP IngressRoute ───────────
IP_ALLOWLIST=$(kubectl get ingressroute -n "$MCP_NS" -o json 2>/dev/null \
  | jq -r '.items[].spec.routes[].middlewares[]?.name // empty' 2>/dev/null | grep -c "ipallow" || echo "0")
assert_eq "$IP_ALLOWLIST" "0" "SA-10" "T8" "Keine ipAllowList-Middleware auf MCP-IngressRoute"

