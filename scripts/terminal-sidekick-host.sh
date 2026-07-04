#!/usr/bin/env bash
# scripts/terminal-sidekick-host.sh
# Terminal-sidekick host setup — opens four ttyd agent windows on the WSL host,
# served over the wg-fleet overlay IP (10.20.0.10) so the cluster can reach
# them via terminal-bridge (selector-less Service → Endpoints → ttyd).
#
# SSOT: openspec/specs/terminal-sidekick.md (post-archive)
#
# Idempotent: checks for an existing tmux session before creating one.
# Run this on the WSL host where ttyd is installed.

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────
TTYD_PORT=7681
WG_INTERFACE="wg-fleet"
WG_IP="10.20.0.10"
SESSION_NAME="terminal-sidekick"

# ── Guard: skip if session already exists ──────────────────────────
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "tmux session '$SESSION_NAME' already exists — exiting (idempotent)"
  exit 0
fi

# ── Start ttyd with four agent windows ─────────────────────────────
# --writable allows the terminal to accept input
# --interface binds ttyd to the wg-fleet overlay IP only (not 0.0.0.0)
tmux new-session -d -s "$SESSION_NAME" -n opencode
tmux new-window  -t "$SESSION_NAME" -n hermes
tmux new-window  -t "$SESSION_NAME" -n claude
tmux new-window  -t "$SESSION_NAME" -n agy

# Launch ttyd bound to the wg overlay IP
ttyd --writable \
     --interface "$WG_IP" \
     --port "$TTYD_PORT" \
     tmux attach-session -t "$SESSION_NAME" &

echo "terminal-sidekick started on ${WG_IP}:${TTYD_PORT} (session: ${SESSION_NAME})"
