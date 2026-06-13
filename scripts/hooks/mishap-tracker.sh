#!/usr/bin/env bash
# scripts/hooks/mishap-tracker.sh
# Record a process friction encountered during a dev-flow / factory run.
#   mishap-tracker.sh --friction "<text>" [--ticket T000XXX] [--severity minor|major|critical]
# With --ticket: appends an internal ticket comment via ticket.sh add-comment.
# Without --ticket: appends a line to ./.mishaps.log (gitignored).
# Never hard-fails a caller's flow: a failed comment write degrades to the log.
set -euo pipefail

TICKET_ID=""
FRICTION=""
SEVERITY="minor"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ticket)   TICKET_ID="$2"; shift 2 ;;
    --friction) FRICTION="$2";  shift 2 ;;
    --severity) SEVERITY="$2";  shift 2 ;;
    *)          echo "mishap-tracker: unknown option: $1" >&2; shift ;;
  esac
done

if [[ -z "$FRICTION" ]]; then
  echo "ERROR: --friction is required." >&2
  exit 2
fi

case "$SEVERITY" in
  minor|major|critical) : ;;
  *) echo "WARNING: unknown severity '$SEVERITY' — defaulting to minor." >&2; SEVERITY="minor" ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TICKET_SH="$HERE/../ticket.sh"

if [[ -n "$TICKET_ID" ]] && [[ -x "$TICKET_SH" ]]; then
  if bash "$TICKET_SH" add-comment --id "$TICKET_ID" \
       --body "MISHAP [${SEVERITY}]: ${FRICTION}" >/dev/null 2>&1; then
    echo "mishap recorded as comment on $TICKET_ID [${SEVERITY}]"
    exit 0
  fi
  echo "WARNING: comment write failed — falling back to .mishaps.log" >&2
fi

printf '%s [%s] %s\n' "$(date -Iseconds)" "$SEVERITY" "$FRICTION" >> .mishaps.log
echo "mishap appended to .mishaps.log [${SEVERITY}]"
