#!/usr/bin/env bash
# opencode-serve.sh — start / stop / restart / status for the opencode HTTP server.
#
# Usage:
#   scripts/opencode-serve.sh  start  [--port PORT] [--hostname HOST]
#   scripts/opencode-serve.sh  stop
#   scripts/opencode-serve.sh  restart
#   scripts/opencode-serve.sh  status
#   scripts/opencode-serve.sh  health
#
# Env vars:
#   OPENCODE_SERVER_PASSWORD  — Basic Auth password (default: change-me)
#   OPENCODE_SERVER_USERNAME  — Basic Auth user   (default: opencode)
#   OPENCODE_SERVE_PORT       — listen port         (default: 4100)
#   OPENCODE_SERVE_HOSTNAME   — listen hostname     (default: 127.0.0.1)
#
# PID file:  ~/.local/share/opencode/opencode-serve.pid
# Log file:  ~/.local/share/opencode/opencode-serve.log

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
OPCODE_SERVER_PASSWORD="${OPENCODE_SERVER_PASSWORD:-change-me}"
OPCODE_SERVER_USERNAME="${OPENCODE_SERVER_USERNAME:-opencode}"
OPCODE_SERVE_PORT="${OPENCODE_SERVE_PORT:-4100}"
OPCODE_SERVE_HOSTNAME="${OPENCODE_SERVE_HOSTNAME:-127.0.0.1}"

PID_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/opencode"
PID_FILE="$PID_DIR/opencode-serve.pid"
LOG_FILE="$PID_DIR/opencode-serve.log"

# ── Helpers ───────────────────────────────────────────────────────────────────

auth_header() {
  # Returns the Authorization: Basic line (base64 encoded).
  printf '%s:%s' "$OPCODE_SERVER_USERNAME" "$OPCODE_SERVER_PASSWORD" | \
    openssl base64 -A 2>/dev/null | { read encoded; echo "Authorization: Basic $encoded"; }
}

api_url() { printf 'http://%s:%s' "$OPCODE_SERVE_HOSTNAME" "$OPCODE_SERVE_PORT"; }

curl_auth() {
  # Wrapper for authenticated curl against the serve instance.
  # Usage: curl_auth GET /global/health   or   curl_auth POST /session -d '{...}'
  local method="$1"; shift
  local path="$1"; shift
  local auth
  auth="$(auth_header)"
  if [[ -n "$*" ]]; then
    curl -s -w '\n%{http_code}' -X "$method" \
      -H "$auth" "$("$api_url")$path" "$@"
  else
    curl -s -w '\n%{http_code}' -X "$method" \
      -H "$auth" "$("$api_url")$path"
  fi
}

running_pid() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return 0
    fi
    rm -f "$PID_FILE"
  fi
  return 1
}

# ── Commands ──────────────────────────────────────────────────────────────────

cmd_start() {
  if running_pid >/dev/null 2>&1; then
    local pid
    pid="$(running_pid)"
    echo "opencode-serve already running (PID $pid on :$OPCODE_SERVE_PORT)"
    return 0
  fi

  mkdir -p "$PID_DIR"

  echo "Starting opencode-serve on ${OPCODE_SERVE_HOSTNAME}:${OPCODE_SERVE_PORT} …"

  export OPENCODE_SERVER_PASSWORD

  nohup opencode serve \
    --port "$OPCODE_SERVE_PORT" \
    --hostname "$OPCODE_SERVE_HOSTNAME" \
    --log-level INFO \
    > "$LOG_FILE" 2>&1 &

  local pid=$!
  echo "$pid" > "$PID_FILE"
  echo "Started opencode-serve (PID $pid)"
  echo "Log: $LOG_FILE"
  echo "API: $(api_url)"

  # Wait briefly and verify
  sleep 2
  if curl -s --max-time 5 "http://127.0.0.1:${OPCODE_SERVE_PORT}/global/health" >/dev/null 2>&1; then
    echo "Health check OK."
  else
    echo "Warning: health check did not respond yet — check $LOG_FILE"
  fi
}

cmd_stop() {
  local pid
  if pid="$(running_pid)"; then
    echo "Stopping opencode-serve (PID $pid) …"
    kill "$pid" 2>/dev/null || true
    # Give it a moment
    local i=0
    while kill -0 "$pid" 2>/dev/null && (( i < 20 )); do
      sleep 0.25
      (( i++ ))
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "Force killing …"
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    echo "Stopped."
  else
    echo "opencode-serve not running."
  fi
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

cmd_status() {
  if running_pid >/dev/null 2>&1; then
    local pid
    pid="$(running_pid)"
    echo "opencode-serve running (PID $pid on :$OPCODE_SERVE_PORT)"
    echo "Log: $LOG_FILE"
  else
    echo "opencode-serve not running."
  fi
}

cmd_health() {
  if running_pid >/dev/null 2>&1; then
    curl_auth GET /global/health
  else
    echo "Server not running. Start with: scripts/opencode-serve.sh start"
    return 1
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

# Parse flags (must come before positional command)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)        OPCODE_SERVE_PORT="$2"; shift 2 ;;
    --hostname)    OPCODE_SERVE_HOSTNAME="$2"; shift 2 ;;
    --password)    OPCODE_SERVER_PASSWORD="$2"; shift 2 ;;
    --port=*)      OPCODE_SERVE_PORT="${1#*=}"; shift ;;
    --hostname=*)  OPCODE_SERVE_HOSTNAME="${1#*=}"; shift ;;
    --password=*)  OPCODE_SERVER_PASSWORD="${1#*=}"; shift ;;
    -h|--help)
      head -22 "$0" | tail -17
      exit 0
      ;;
    *) break ;;
  esac
done

case "${1:-status}" in
  start|stop|restart|status|health)
    "cmd_$1" "$@"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|health} [--port PORT]" >&2
    exit 1
    ;;
esac
