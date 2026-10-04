#!/usr/bin/env bash
# scripts/hooks/agent-waiting.sh — markiert Pane als wartend, klaut NIE den Fokus.
# Aufruf aus PermissionRequest (sofort) und Notification-Fallback (permission_prompt/
# idle_prompt, 6s/60s-Gate). Setzt nur `tmux set -p @agent waiting`.
# Kein select-pane, kein Zoom — das macht nur der Mensch per prefix+n.
# [T901059]: KEINE `tmux info`-Readiness-Probe — info exitt 1 auch bei laufendem
# Server (braucht attached Client), waehrend `set -p` funktioniert. Nur TMUX_PANE
# pruefen, set-Fehler still schlucken.
set -uo pipefail
if [ -n "${TMUX_PANE:-}" ]; then
  tmux set -p -t "$TMUX_PANE" @agent waiting >/dev/null 2>&1 || true
fi
exit 0
