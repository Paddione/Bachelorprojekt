#!/usr/bin/env bash
# scripts/agent-push.sh — universeller Push-Hook für opencode/agy-Session-Events. [T000991]
#
# Usage: agent-push.sh <source> <event-type> <ticket-or-session-id> [summary]
#   source: opencode | agy
#
# Flow: Opt-in-Check (GET AGENT_PUSH_API, fail-closed) → HTTP-POST an ntfy → Retry 3x → Fallback-Log.
# DSGVO: Body enthält NUR Event-Typ + ID + Link, niemals den rohen Payload/Volltext.
set -euo pipefail

SOURCE="${1:?usage: agent-push.sh <source> <event> <id> [summary]}"
EVENT="${2:?missing event}"
REF_ID="${3:?missing id}"
SUMMARY="${4:-}"

LOGFILE="${AGENT_PUSH_LOG:-/var/log/agent-push.log}"
NTFY_BASE="${NTFY_BASE_URL:?NTFY_BASE_URL not set}"
TOPIC="bachelorprojekt-${SOURCE}"

if [ "$SOURCE" = "opencode" ]; then
  TOKEN="${NTFY_TOKEN_OPEncode:-${NTFY_TOKEN_OPENCODE:-}}"
else
  TOKEN_VAR="NTFY_TOKEN_$(echo "$SOURCE" | tr '[:lower:]' '[:upper:]')"
  TOKEN="${!TOKEN_VAR:-}"
fi

: "${TOKEN:?token for $SOURCE not set}"

# Opt-in-Check (fail-closed): API entscheidet pro Quelle, default aus
OPT_IN=$(curl -fsS -m 3 -H "Authorization: Bearer ${AGENT_PUSH_TOKEN}" \
  "${AGENT_PUSH_API:-}/api/admin/agent-push/settings?source=${SOURCE}" 2>/dev/null || echo '{"enabled":false}')
ENABLED=$(echo "$OPT_IN" | python3 -c "import json,sys;print(json.load(sys.stdin).get('enabled',False))" 2>/dev/null || echo "False")
if [ "$ENABLED" != "True" ]; then
  # Ensure the directory for the logfile exists
  mkdir -p "$(dirname "$LOGFILE")" 2>/dev/null || true
  echo "$(date -Is) SKIP source=${SOURCE} event=${EVENT} id=${REF_ID} (opt-out)" >>"$LOGFILE" 2>/dev/null || true
  exit 0
fi

# DSGVO-sicherer Body: nur Event-Typ + ID + Link, kein Payload-Volltext
TITLE="[${SOURCE}] ${EVENT}"
BODY="${REF_ID}${SUMMARY:+ — ${SUMMARY}}"
[ -n "${AGENT_PUSH_LINK_BASE:-}" ] && BODY="${BODY}\n${AGENT_PUSH_LINK_BASE}/${REF_ID}"

post() {
  curl -fsS -m 5 -H "Authorization: Bearer ${TOKEN}" \
    -H "Title: ${TITLE}" -d "${BODY}" "${NTFY_BASE}/${TOPIC}"
}

for attempt in 1 2 3; do
  if post; then exit 0; fi
  sleep $((attempt * attempt))
done

mkdir -p "$(dirname "$LOGFILE")" 2>/dev/null || true
echo "$(date -Is) GIVEUP source=${SOURCE} event=${EVENT} id=${REF_ID}" >>"$LOGFILE" 2>/dev/null || true
exit 0
