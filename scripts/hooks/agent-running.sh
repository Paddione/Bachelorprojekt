#!/usr/bin/env bash
# scripts/hooks/agent-running.sh — loescht die Wartemarkierung, klaut NIE den Fokus.
# Aufruf aus PostToolUse, PostToolUseFailure, UserPromptSubmit, Stop, SessionEnd.
# (PermissionDenied reicht NICHT: feuert nur im Auto-Mode, nicht bei manuellem Deny.)
# [T901059]: keine `tmux info`-Probe (siehe agent-waiting.sh).
set -uo pipefail
if [ -n "${TMUX_PANE:-}" ]; then
  tmux set -p -t "$TMUX_PANE" @agent running >/dev/null 2>&1 || true
fi
exit 0
