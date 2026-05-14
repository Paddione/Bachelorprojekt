#!/usr/bin/env bash
# Read the last {"choice": "X"} event from a brainstorm session events file.
# Usage: brainstorm-extract-choice.sh <state_dir>
# Output: prints the choice label (e.g. "A") or exits 1 if no choice event found.
set -euo pipefail

STATE_DIR="${1:?Usage: brainstorm-extract-choice.sh <state_dir>}"
EVENTS_FILE="$STATE_DIR/events"

if [[ ! -f "$EVENTS_FILE" ]]; then
  echo "no events file at $EVENTS_FILE" >&2
  exit 1
fi

CHOICE=$(grep -o '"choice":"[^"]*"' "$EVENTS_FILE" | tail -1 | sed 's/"choice":"//;s/"//')
if [[ -z "$CHOICE" ]]; then
  echo "no choice event found in $EVENTS_FILE" >&2
  exit 1
fi

echo "$CHOICE"
