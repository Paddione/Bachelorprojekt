#!/usr/bin/env bash
# scripts/dsh/web-up.sh — Start the DSH Web UI and register in the Session Hub.
#
# Checks that deepseek-harness is built (node_modules + dist), starts the
# web UI with the repo bundle as overlay, registers in the session hub,
# and waits for the process to end (reaping the registration on exit).
#
# Usage: web-up.sh [port]
# Default port: 3080
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DSH_DIR="${DSH_DIR:-$REPO/deepseek-harness}"
DSH_WEB_PORT="${1:-${DSH_WEB_PORT:-3080}}"
BUNDLE_DIR="$REPO/tools/dsh"

# --- Check prerequisites -----------------------------------------------------------
if [[ ! -d "$DSH_DIR/node_modules" ]]; then
  echo "web-up: deepseek-harness not built (node_modules missing). Run:" >&2
  echo "  cd $DSH_DIR && pnpm install && pnpm run build" >&2
  exit 2
fi

DSH_BIN="$DSH_DIR/node_modules/.bin/dsh"
if [[ ! -x "$DSH_BIN" ]]; then
  echo "web-up: dsh binary not found at $DSH_BIN" >&2
  exit 2
fi

# --- Start the web UI with the bundle overlay --------------------------------------
echo "web-up: starting dsh web UI on port $DSH_WEB_PORT with bundle from $BUNDLE_DIR" >&2

"$DSH_BIN" --profile web --bundle "$BUNDLE_DIR" --port "$DSH_WEB_PORT" &
DSH_PID=$!

# --- Register in Session Hub -------------------------------------------------------
HUB_SLUG="dsh-web-${DSH_WEB_PORT}"
bash "$REPO/scripts/session-hub.sh" register \
  --slug "$HUB_SLUG" \
  --type "dsh-web" \
  --title "DSH Web UI (port $DSH_WEB_PORT)" \
  --url "http://127.0.0.1:$DSH_WEB_PORT" \
  2>/dev/null || true

# --- Wait and reap -----------------------------------------------------------------
trap "bash '$REPO/scripts/session-hub.sh' deregister --slug '$HUB_SLUG' 2>/dev/null || true" EXIT
wait "$DSH_PID" || true
