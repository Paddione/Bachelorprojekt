#!/usr/bin/env bash
# scripts/dsh/session-audit.sh — Write factory phase events from DSH sessions.
# Thin wrapper around scripts/ticket.sh phase that builds the detail JSON
# with jq -cn (matching opencode-exec.sh's phase_event() helper).
#
# Usage: session-audit.sh <ticket_ext_id> <phase_state> <detail_json>
#   <ticket_ext_id>  Ticket external ID (e.g. T012962)
#   <phase_state>    entered|done|blocked
#   <detail_json>    JSON string for the --detail flag
#
# The executor field is always "dsh".
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${REPO_ROOT:-$(cd "$HERE/../.." && pwd)}"

EXT_ID="${1:-}"; PHASE_STATE="${2:-}"; DETAIL_JSON="${3:-}"

[[ -z "$EXT_ID" ]] && { echo "session-audit: missing ticket ext_id" >&2; exit 1; }
[[ -z "$PHASE_STATE" ]] && { echo "session-audit: missing phase state (entered|done|blocked)" >&2; exit 1; }

# Build the detail JSON with executor=dsh, merging any caller-provided detail.
detail="$(jq -cn \
  --arg executor "dsh" \
  --argjson extra "${DETAIL_JSON:-{}}" \
  '$extra + {executor: $executor}' 2>/dev/null || echo "{\"executor\":\"dsh\"}")"

bash "$REPO/scripts/ticket.sh" phase "$EXT_ID" implement "$PHASE_STATE" \
  --driver factory --detail "$detail" 2>/dev/null || true
