#!/usr/bin/env bash
notify_pushover() {
  local title="$1" message="$2" priority="${3:-0}"
  if [[ -z "${PUSHOVER_TOKEN:-}" || -z "${PUSHOVER_USER:-}" ]]; then
    echo "⚠ Pushover not configured (PUSHOVER_TOKEN/PUSHOVER_USER missing) — skipping notification" >&2
    return 0
  fi
  if ! curl -fsS --max-time 10 -d "token=${PUSHOVER_TOKEN}&user=${PUSHOVER_USER}&title=${title}&message=${message}&priority=${priority}" https://api.pushover.net/1/messages.json 2>/dev/null; then
    echo "⚠ Pushover notification failed (curl error) — continuing" >&2
  fi
}
