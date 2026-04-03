#!/usr/bin/env bash
# FA-12: OpenClaw AI Assistant — Bot and Channel Infrastructure
# Tests: Bot-User exists, openclaw channels exist, admin access
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
_mmctl() { kubectl exec -n "$NAMESPACE" deploy/mattermost -- mmctl --local "$@"; }

# ── T1: OpenClaw bot user exists ─────────────────────────────────
BOT_USER=$(_mmctl bot list --json 2>/dev/null | jq -r '.[] | select(.username=="openclaw") | .username' 2>/dev/null)
assert_eq "$BOT_USER" "openclaw" "FA-12" "T1" "Bot-User 'openclaw' existiert"

# ── T2: OpenClaw channels exist in teams ─────────────────────────
TEAM_NAME=$(_mmctl team list --json 2>/dev/null | jq -r '.[0].name' 2>/dev/null)
if [[ -n "$TEAM_NAME" ]]; then
  CHANNEL_EXISTS=$(_mmctl channel list "$TEAM_NAME" --json 2>/dev/null | jq -r '.[] | select(.name=="openclaw") | .name' 2>/dev/null)
  assert_eq "$CHANNEL_EXISTS" "openclaw" "FA-12" "T2" "OpenClaw-Kanal existiert in Team '${TEAM_NAME}'"
else
  skip_test "FA-12" "T2" "OpenClaw-Kanal" "Kein Team gefunden"
fi

# ── T3: Bot user is member of the channel ───────────────────────
if [[ -n "$TEAM_NAME" ]]; then
  IS_MEMBER=$(_mmctl channel users list "${TEAM_NAME}:openclaw" --json 2>/dev/null | jq -r '.[] | select(.username=="openclaw") | .username' 2>/dev/null)
  assert_eq "$IS_MEMBER" "openclaw" "FA-12" "T3" "Bot-User ist Mitglied im OpenClaw-Kanal"
else
  skip_test "FA-12" "T3" "Bot-Mitgliedschaft" "Kein Team gefunden"
fi

# ── T4: openclaw-mattermost-setup.sh script exists ─────────────
SCRIPT_PATH="${SCRIPT_DIR}/../scripts/openclaw-mattermost-setup.sh"
assert_eq "$(test -f "${SCRIPT_PATH}" && echo "exists" || echo "missing")" "exists" \
  "FA-12" "T4" "openclaw-mattermost-setup.sh vorhanden"

# ── T5: system-prompt.md exists ──────────────────────────────────
PROMPT_PATH="${SCRIPT_DIR}/../openclaw/system-prompt.md"
assert_eq "$(test -f "${PROMPT_PATH}" && echo "exists" || echo "missing")" "exists" \
  "FA-12" "T5" "OpenClaw System-Prompt vorhanden"

assert_summary
