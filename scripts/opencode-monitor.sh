#!/usr/bin/env bash
# opencode-monitor.sh — observe opencode serve sessions & event stream.
#
# Usage:
#   scripts/opencode-monitor.sh  health                # quick health check
#   scripts/opencode-monitor.sh  sessions              # list all sessions
#   scripts/opencode-monitor.sh  status                # session status map
#   scripts/opencode-monitor.sh  events [--follow]     # dump /event stream (SSE)
#   scripts/opencode-monitor.sh  events [--follow] -p PATTERN   # filter events by pattern
#   scripts/opencode-monitor.sh  session <id>           # details for one session
#   scripts/opencode-monitor.sh  todos <id>             # todo list for a session
#
# Env vars:
#   OPENCODE_SERVER_PASSWORD  — Basic Auth password (default: change-me)
#   OPENCODE_SERVER_USERNAME  — Basic Auth user   (default: opencode)
#   OPENCODE_SERVE_PORT       — listen port         (default: 4100)
#   OPENCODE_SERVE_HOSTNAME   — listen hostname     (default: 127.0.0.1)

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
# Passwort-Vorrang: $OPENCODE_SERVER_PASSWORD (Env) > Secret-Datei (Mode 600,
# angelegt via setup-autostart.sh) > Platzhalter change-me.
_OPCODE_SECRET_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/opencode/.server_password"
OPCODE_SERVER_PASSWORD="${OPENCODE_SERVER_PASSWORD:-}"
if [[ -z "$OPCODE_SERVER_PASSWORD" && -f "$_OPCODE_SECRET_FILE" ]]; then
  OPCODE_SERVER_PASSWORD="$(cat "$_OPCODE_SECRET_FILE")"
fi
OPCODE_SERVER_PASSWORD="${OPCODE_SERVER_PASSWORD:-change-me}"
OPCODE_SERVER_USERNAME="${OPENCODE_SERVER_USERNAME:-opencode}"
OPCODE_SERVE_PORT="${OPENCODE_SERVE_PORT:-4100}"
OPCODE_SERVE_HOSTNAME="${OPENCODE_SERVE_HOSTNAME:-127.0.0.1}"

API="http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}"

# ── Auth helper ──────────────────────────────────────────────────────────────

curl_auth() {
  local auth
  auth="$(printf '%s:%s' "$OPCODE_SERVER_USERNAME" "$OPCODE_SERVER_PASSWORD" | openssl base64 -A 2>/dev/null)"
  curl -s -w '\n%{http_code}' -H "Authorization: Basic $auth" "$@"
}

# ── Commands ──────────────────────────────────────────────────────────────────

cmd_health() {
  local raw code body
  raw="$(curl_auth --max-time 5 --silent -w '\n%{http_code}' \
    "http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}/global/health" 2>/dev/null)"
  code="${raw##*$'\n'}"
  body="${raw%$'\n'*}"
  if [[ "$code" == "200" ]]; then
    echo "OK — $body"
  else
    echo "FAIL (HTTP $code) — $body" >&2
    return 1
  fi
}

cmd_sessions() {
  echo "=== Sessions ==="
  curl_auth "http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}/session" | sed '$ d' | python3 -m json.tool 2>/dev/null || \
    curl_auth "http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}/session" | sed '$ d'
}

cmd_status() {
  echo "=== Session Status ==="
  curl_auth "http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}/session/status" | sed '$ d' | python3 -m json.tool 2>/dev/null || \
    curl_auth "http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}/session/status" | sed '$ d'
}

# ── Helpers ───────────────────────────────────────────────────────────────────

_sse_snapshot() {
  # Cross-platform SSE snapshot: capture up to 5s of events.
  # Usage: _sse_snapshot [PATTERN]
  # On Windows we avoid 'timeout' (unreliable in git-bash); use background
  # sleep + kill of the curl subprocess instead.
  local pattern="${1:-}"
  curl_auth -N -H 'Accept: text/event-stream' \
    "http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}/event" 2>/dev/null &
  local curl_pid=$!
  sleep 5
  kill "$curl_pid" 2>/dev/null || true
  wait "$curl_pid" 2>/dev/null || true
  # If a pattern filter is active, this was called from within cmd_events
  # which already printed the header; otherwise print our own.
}

cmd_events() {
  local follow=false pattern=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --follow|-f)  follow=true; shift ;;
      -p|--pattern) pattern="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  if [[ -n "$pattern" ]]; then
    if $follow; then
      echo "=== Event stream (follow, filtered: '$pattern') ==="
      curl_auth -N -H 'Accept: text/event-stream' \
        "http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}/event" 2>/dev/null | \
        while IFS= read -r line; do
          if echo "$line" | grep -q "$pattern"; then
            echo "$line"
          fi
        done
    else
      echo "=== Event stream (snapshot, filtered: '$pattern') ==="
      _sse_snapshot "$pattern"
    fi
  else
    if $follow; then
      echo "=== Event stream (follow) ==="
      curl_auth -N -H 'Accept: text/event-stream' \
        "http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}/event" 2>/dev/null | \
        while IFS= read -r line; do
          echo "$line"
        done
    else
      echo "=== Event stream (snapshot, 5s) ==="
      _sse_snapshot
    fi
  fi
}

cmd_session() {
  local id="${1:-}"
  if [[ -z "$id" ]]; then
    echo "Usage: $0 session <session-id>" >&2
    return 1
  fi
  echo "=== Session $id ==="
  curl_auth "http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}/session/$id" | sed '$ d' | python3 -m json.tool 2>/dev/null || \
    curl_auth "http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}/session/$id" | sed '$ d'
}

cmd_todos() {
  local id="${1:-}"
  if [[ -z "$id" ]]; then
    echo "Usage: $0 todos <session-id>" >&2
    return 1
  fi
  echo "=== Todos for session $id ==="
  curl_auth "http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}/session/$id/todo" | sed '$ d' | python3 -m json.tool 2>/dev/null || \
    curl_auth "http://${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT}/session/$id/todo" | sed '$ d'
}

# ── Main ──────────────────────────────────────────────────────────────────────

case "${1:-help}" in
  health)    cmd_health ;;
  sessions)  cmd_sessions ;;
  status)    cmd_status ;;
  events)    shift; cmd_events "$@" ;;
  session)   shift; cmd_session "$@" ;;
  todos)     shift; cmd_todos "$@" ;;
  *)
    cat >&2 <<EOF
Usage: $0 {health|sessions|status|events|session|todos} [args]

Commands:
  health                        Health check
  sessions                      List all sessions
  status                        Session status map
  events [--follow|-f] [-p PAT] Event stream (SSE), optionally follow-mode or filtered
  session <id>                  Session details
  todos <id>                    Todo list for a session
EOF
    exit 1
    ;;
esac
