#!/usr/bin/env bash
# FA-13: Mattermost Docs Integration — Docs Channel and Links
# Tests: Documentation channel exists, channel header set, integration script exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
_mmctl() { kubectl exec -n "$NAMESPACE" deploy/mattermost -- mmctl --local "$@"; }

# ── T1: mattermost-docs-integration.sh script exists ────────────
SCRIPT_PATH="${SCRIPT_DIR}/../scripts/mattermost-docs-integration.sh"
assert_eq "$(test -f "${SCRIPT_PATH}" && echo "exists" || echo "missing")" "exists" \
  "FA-13" "T1" "mattermost-docs-integration.sh vorhanden"

# ── T2: Dokumentation channel exists in teams ───────────────────
TEAM_NAME=$(_mmctl team list --json 2>/dev/null | jq -r '.[0].name' 2>/dev/null)
if [[ -n "$TEAM_NAME" ]]; then
  CHANNEL_EXISTS=$(_mmctl channel list "$TEAM_NAME" --json 2>/dev/null | jq -r '.[] | select(.name=="dokumentation") | .name' 2>/dev/null)
  assert_eq "$CHANNEL_EXISTS" "dokumentation" "FA-13" "T2" "Dokumentation-Kanal existiert in Team '${TEAM_NAME}'"
else
  skip_test "FA-13" "T2" "Dokumentation-Kanal" "Kein Team gefunden"
fi

# ── T3: Channel header contains Docs link ───────────────────────
if [[ -n "$TEAM_NAME" ]]; then
  HEADER=$(_mmctl channel show "${TEAM_NAME}:dokumentation" --json 2>/dev/null | jq -r '.header' 2>/dev/null)
  assert_contains "$HEADER" "Docs" "FA-13" "T3" "Kanal-Header enthält Dokumentations-Link"
else
  skip_test "FA-13" "T3" "Kanal-Header" "Kein Team gefunden"
fi

# ── T4: Docs domain is configured in ConfigMap ─────────────────
DOCS_DOMAIN=$(kubectl get configmap domain-config -n "$NAMESPACE" -o jsonpath='{.data.DOCS_DOMAIN}' 2>/dev/null)
assert_contains "$DOCS_DOMAIN" "localhost" "FA-13" "T4" "DOCS_DOMAIN in domain-config gesetzt (${DOCS_DOMAIN})"

assert_summary
