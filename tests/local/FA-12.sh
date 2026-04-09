#!/usr/bin/env bash
# FA-12: Claude Code AI Assistant — MCP Infrastructure, ForwardAuth, Status Page
# (Replaces former Claude Code AI Assistant tests)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
MCP_NS="${MCP_NAMESPACE:-workspace}"
_kube_curl() { kubectl exec -n "$NAMESPACE" deploy/mattermost -- curl -s "$@" 2>/dev/null; }

# ── T1: MCP core pod running ────────────────────────────────────
CORE_READY=$(kubectl get deploy claude-code-mcp-core -n "$MCP_NS" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${CORE_READY:-0}" "0" "FA-12" "T1" "MCP-Core-Pod running (readyReplicas > 0)"

# ── T2: MCP apps pod running ────────────────────────────────────
APPS_READY=$(kubectl get deploy claude-code-mcp-apps -n "$MCP_NS" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${APPS_READY:-0}" "0" "FA-12" "T2" "MCP-Apps-Pod running (readyReplicas > 0)"

# ── T3: MCP auth pod running ────────────────────────────────────
AUTH_READY=$(kubectl get deploy claude-code-mcp-auth -n "$MCP_NS" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${AUTH_READY:-0}" "0" "FA-12" "T3" "MCP-Auth-Pod running (readyReplicas > 0)"

# ── T4: MCP status page deployed ────────────────────────────────
STATUS_READY=$(kubectl get deploy mcp-status -n "$MCP_NS" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${STATUS_READY:-0}" "0" "FA-12" "T4" "MCP-Statusseite deployed (readyReplicas > 0)"

# ── T5: MCP ForwardAuth proxy deployed ──────────────────────────
AUTH_PROXY_READY=$(kubectl get deploy mcp-auth-proxy -n "$MCP_NS" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "${AUTH_PROXY_READY:-0}" "0" "FA-12" "T5" "ForwardAuth-Proxy deployed (readyReplicas > 0)"

# ── T6: ForwardAuth healthz reachable ───────────────────────────
AUTH_HEALTH=$(_kube_curl -o /dev/null -w '%{http_code}' "http://mcp-auth-proxy.${MCP_NS}.svc/healthz")
assert_eq "$AUTH_HEALTH" "200" "FA-12" "T6" "ForwardAuth /healthz erreichbar"

# ── T7: ForwardAuth rejects unauthenticated requests ────────────
AUTH_NOTOKEN=$(_kube_curl -o /dev/null -w '%{http_code}' "http://mcp-auth-proxy.${MCP_NS}.svc/auth")
assert_eq "$AUTH_NOTOKEN" "401" "FA-12" "T7" "ForwardAuth ohne Token → HTTP 401"

# ── T8: ForwardAuth rejects invalid token ───────────────────────
AUTH_BADTOKEN=$(_kube_curl -o /dev/null -w '%{http_code}' -H "Authorization: Bearer invalid-token-12345" \
  "http://mcp-auth-proxy.${MCP_NS}.svc/auth")
assert_eq "$AUTH_BADTOKEN" "401" "FA-12" "T8" "ForwardAuth mit ungültigem Token → HTTP 401"

# ── T9: ForwardAuth accepts valid cluster token ─────────────────
CLUSTER_TOKEN=$(kubectl get secret mcp-tokens -n "$MCP_NS" -o jsonpath='{.data.CLUSTER_TOKEN}' 2>/dev/null | base64 -d)
if [[ -n "$CLUSTER_TOKEN" ]]; then
  AUTH_VALID=$(_kube_curl -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${CLUSTER_TOKEN}" \
    "http://mcp-auth-proxy.${MCP_NS}.svc/auth")
  assert_eq "$AUTH_VALID" "200" "FA-12" "T9" "ForwardAuth mit gültigem Cluster-Token → HTTP 200"
else
  skip_test "FA-12" "T9" "ForwardAuth Cluster-Token" "mcp-tokens Secret nicht gefunden"
fi

# ── T10: mcp-tokens Secret exists ───────────────────────────────
TOKEN_SECRET=$(kubectl get secret mcp-tokens -n "$MCP_NS" -o name 2>/dev/null || echo "")
assert_contains "$TOKEN_SECRET" "mcp-tokens" "FA-12" "T10" "mcp-tokens Secret existiert"

# ── T11: Claude Code MCP settings templates exist ───────────────
CLUSTER_SETTINGS="${SCRIPT_DIR}/../.claude/settings.json"
if [[ -f "$CLUSTER_SETTINGS" ]]; then
  _log_result "FA-12" "T11" "Claude Code Settings-Template vorhanden" "pass" "0"
else
  # Check alternative locations
  FOUND="false"
  for f in "${SCRIPT_DIR}/../claude-code"/*.json "${SCRIPT_DIR}/../.claude"/*.json; do
    [[ -f "$f" ]] && FOUND="true" && break
  done
  if [[ "$FOUND" == "true" ]]; then
    _log_result "FA-12" "T11" "Claude Code Settings-Template vorhanden" "pass" "0"
  else
    _log_result "FA-12" "T11" "Claude Code Settings-Template vorhanden" "fail" "0" "Kein Settings-Template gefunden"
  fi
fi

# ── T12: Claude Code WebUI no longer deployed ──────────────────────
WEBUI_DEPLOY=$(kubectl get deploy claude-code-webui -n "$MCP_NS" 2>/dev/null && echo "exists" || echo "removed")
assert_eq "$WEBUI_DEPLOY" "removed" "FA-12" "T12" "Claude Code-WebUI nicht mehr deployed"

