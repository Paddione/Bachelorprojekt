#!/usr/bin/env bash
# scripts/factory/qa-notify.sh — QS-Abnahme-Notifications [T000730]
#
# Sendet eine PushNotification für QS-Abnahme-Events. Aufgerufen von pipeline.js
# nach der qa_review- bzw. done-Transition (Lücke 7.1).
#
# Usage: bash scripts/factory/qa-notify.sh \
#          --event qa_review|done \
#          --ticket-id T000730 \
#          --title "Feature-Titel" \
#          --slug factory-qs-abnahme-loop
#
# Dieses Skript gibt einen strukturierten JSON-Block aus, den der
# rufende Workflow-Agent via ToolSearch+PushNotification weiterleitet.
set -euo pipefail

EVENT="" TICKET_ID="" TITLE="" SLUG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --event)      EVENT="$2"; shift 2 ;;
    --ticket-id)  TICKET_ID="$2"; shift 2 ;;
    --title)      TITLE="$2"; shift 2 ;;
    --slug)       SLUG="$2"; shift 2 ;;
    --help)
      echo "Usage: bash $(basename "${BASH_SOURCE[0]}") --event qa_review|done --ticket-id T###### --title <title> --slug <slug>"
      echo "  qa-notify: gibt PushNotification-Payload für QS-Abnahme-Events aus"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$TICKET_ID" ]]; then echo "ERROR: --ticket-id is required." >&2; exit 2; fi
if [[ -z "$SLUG" ]];      then echo "ERROR: --slug is required."      >&2; exit 2; fi
if [[ -z "$EVENT" ]]; then
  echo "ERROR: --event is required (qa_review|done)." >&2; exit 2
fi
if [[ "$EVENT" != "qa_review" && "$EVENT" != "done" ]]; then
  echo "ERROR: --event must be qa_review|done (got: $EVENT)." >&2; exit 2
fi

case "$EVENT" in
  qa_review)
    PUSH_TITLE="Factory QS-Review: ${TICKET_ID}"
    PUSH_BODY="Ticket \"${TITLE:-$TICKET_ID}\" (${SLUG}) wartet auf QS-Abnahme. E2E-Tests laufen nachts oder on-demand."
    ;;
  done)
    PUSH_TITLE="Feature live: ${TICKET_ID}"
    PUSH_BODY="Ticket \"${TITLE:-$TICKET_ID}\" (${SLUG}) erfolgreich abgenommen. Feature-Flag aktiviert."
    ;;
esac

cat <<EOF
QA_NOTIFY_PAYLOAD: title="${PUSH_TITLE}" body="${PUSH_BODY}" event=${EVENT} ticket=${TICKET_ID} slug=${SLUG}
EOF
