#!/usr/bin/env bash
# scripts/hooks/agent-waiting.sh — markiert Pane als wartend, klaut NIE den Fokus.
# Aufruf aus PermissionRequest (sofort) und Notification-Fallback (permission_prompt/
# idle_prompt, 6s/60s-Gate). Setzt nur `tmux set -p @agent waiting`.
# Kein select-pane, kein Zoom — das macht nur der Mensch per prefix+n.
set -uo pipefail
if [ -n "${TMUX_PANE:-}" ] && tmux info >/dev/null 2>&1; then
  tmux set -p -t "$TMUX_PANE" @agent waiting >/dev/null 2>&1 || true
fi
exit 0
