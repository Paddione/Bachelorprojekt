#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# set-mattermost-theme.sh
#
# Pushes the dark+gold custom theme to all non-bot users in
# Mattermost via the REST API. Idempotent — safe to re-run.
#
# Usage:
#   bash scripts/set-mattermost-theme.sh [namespace] [mm-url]
#
# Requirements:
#   curl available on the developer machine
#   kubectl context pointing at the target cluster (for secret + domain lookup)
# ════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${1:-workspace}"
MM_URL="${2:-${MM_URL:-}}"

if [[ -z "$MM_URL" ]]; then
  # Try to get the Mattermost hostname from the cluster's domain configmap
  CHAT_HOST=$(kubectl --context="$(kubectl config current-context)" \
    get configmap workspace-domains -n "$NAMESPACE" \
    -o jsonpath='{.data.CHAT_DOMAIN}' 2>/dev/null || true)
  if [[ -n "$CHAT_HOST" ]]; then
    MM_URL="https://$CHAT_HOST"
  else
    echo "ERROR: Pass MM_URL as second argument or set MM_URL env var"
    echo "  Usage: $0 [namespace] <mm-url>"
    echo "  Example: $0 workspace https://chat.mentolder.de"
    exit 1
  fi
fi

_mm() { curl -sf "$@"; }

# ── Admin credentials ──────────────────────────────────────
MM_ADMIN_USER="${MM_ADMIN_USER:-admin}"
MM_ADMIN_PASS="${MM_ADMIN_PASS:-$(kubectl get secret workspace-secrets \
  -n "$NAMESPACE" -o jsonpath='{.data.MATTERMOST_ADMIN_PASSWORD}' 2>/dev/null \
  | base64 -d 2>/dev/null || echo "devadmin")}"

# ── Login → Bearer token ───────────────────────────────────
echo "Logging in as $MM_ADMIN_USER..."
TOKEN=$(_mm -X POST "$MM_URL/api/v4/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"$MM_ADMIN_USER\",\"password\":\"$MM_ADMIN_PASS\"}" \
  -D - -o /dev/null \
  | grep -i "^token:" | awk '{print $2}' | tr -d '\r\n')

[[ -z "$TOKEN" ]] && { echo "ERROR: Mattermost login failed"; exit 1; }
echo "  Token obtained."

# ── Theme JSON (mentolder dark+gold) ───────────────────────
THEME='{"sidebarBg":"#0f1623","sidebarText":"#e8e8f0","sidebarUnreadText":"#ffffff","sidebarTextHoverBg":"#1a2235","sidebarTextActiveBorder":"#e8c870","sidebarTextActiveColor":"#e8c870","sidebarHeaderBg":"#0a0f1a","sidebarTeamBarBg":"#070c15","sidebarHeaderTextColor":"#e8e8f0","onlineIndicator":"#4caf50","awayIndicator":"#ff9800","dndIndicator":"#ef4444","mentionBg":"#e8c870","mentionColor":"#0f1623","centerChannelBg":"#0f1623","centerChannelColor":"#e8e8f0","newMessageSeparator":"#e8c870","linkColor":"#e8c870","buttonBg":"#e8c870","buttonColor":"#0f1623","errorTextColor":"#ef4444","mentionHighlightBg":"#1a2235","mentionHighlightLink":"#e8c870","codeTheme":"monokai"}'
THEME_ESCAPED=$(echo "$THEME" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")

# ── All non-bot users ──────────────────────────────────────
USER_IDS=$(_mm -H "Authorization: Bearer $TOKEN" \
  "$MM_URL/api/v4/users?per_page=200&active=true" \
  | python3 -c "
import sys, json
users = json.load(sys.stdin)
print('\n'.join(u['id'] for u in users if not u.get('is_bot', False)))
")

COUNT=$(printf '%s' "$USER_IDS" | grep -c . || true)
echo "Setting theme for $COUNT users..."

for UID in $USER_IDS; do
  # Get team IDs for this user
  TEAM_IDS=$(_mm -H "Authorization: Bearer $TOKEN" \
    "$MM_URL/api/v4/users/$UID/teams" \
    | python3 -c "
import sys, json
teams = json.load(sys.stdin)
if isinstance(teams, list):
    print('\n'.join(t['id'] for t in teams))
" 2>/dev/null || true)

  # Build preferences array: one entry per team + one global (empty name)
  PREFS="["
  for TID in $TEAM_IDS; do
    PREFS+="{\"user_id\":\"$UID\",\"category\":\"theme\",\"name\":\"$TID\",\"value\":$THEME_ESCAPED},"
  done
  PREFS+="{\"user_id\":\"$UID\",\"category\":\"theme\",\"name\":\"\",\"value\":$THEME_ESCAPED}]"

  RESP=$(_mm -X PUT \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PREFS" \
    "$MM_URL/api/v4/users/$UID/preferences")
  echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  WARN: '+d.get('message','?')) if 'status_code' in d else None" 2>/dev/null || true

  echo "  ✓ $UID"
done

echo "Mattermost theme applied to all users."
