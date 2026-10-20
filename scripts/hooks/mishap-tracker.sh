#!/usr/bin/env bash
# scripts/hooks/mishap-tracker.sh
# Record a process friction encountered during a dev-flow run.
#   mishap-tracker.sh --friction "<text>" [--severity minor|major|critical]
# Logs to stderr and appends a line to ./.mishaps.log (gitignored) — the entry
# is recorded, but NO ticket and NO collection container is created [T014104].
# --ticket is accepted as a legacy no-op (Ticket-Backend retiriert 2026-10-14).
# Never hard-fails a caller's flow.
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

if [[ -n "$TICKET_ID" ]]; then
  echo "WARNING: --ticket is a legacy no-op (no ticket backend since 2026-10-14) — logging locally" >&2
fi

# Protokollieren und verwerfen. Exit 0 — ein Mishap darf den Lauf des
# Aufrufers nicht scheitern lassen [T014104].
printf '[mishap] recorded locally [%s]: %s\n' "$SEVERITY" "$FRICTION" >&2
printf '%s [%s] %s\n' "$(date -Iseconds)" "$SEVERITY" "$FRICTION" >> .mishaps.log
echo "mishap appended to .mishaps.log [${SEVERITY}]"
exit 0
