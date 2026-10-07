#!/usr/bin/env bash
# scripts/agent-tmux-start.sh — Starter: repo-lokaler Worktree + tmux-Fenster, SHARED DB.
# Nutzung:  bash scripts/agent-tmux-start.sh <name> [base-ref]
# Worktree: .claude/worktrees/<name> (nativ wie `claude -w`, reboot-sicher; NIE /tmp).
# DB:       dieselbe devmesh-DB fuer alle Panes (keine Trennung) — via
#           `source scripts/env-resolve.sh`, NIE ausfuehren, NIE Secrets drucken.
# Ports:    Basis + erster freier Index (ss-Probe), als PORT_OFFSET/APP_PORT exportiert.
set -uo pipefail
NAME="${1:-}"; BASE="${2:-origin/main}"
[ -n "$NAME" ] || { echo "usage: $0 <name> [base-ref]" >&2; exit 1; }
REPO="$(git rev-parse --show-toplevel)"
WT="$REPO/.claude/worktrees/$NAME"
if [ ! -d "$WT" ]; then
  git -c filter.git-crypt.smudge= -c filter.git-crypt.clean= -c filter.git-crypt.required=false \
    worktree add "$WT" -b "$NAME" "$BASE" || git worktree add "$WT" "$BASE"
else
  echo "reuse: $WT"
fi
# Port: ab 4100 ersten freien nehmen (shared-Host, Worktrees teilen sich Ports).
PORT=4100
while ss -ltn 2>/dev/null | grep -q ":$PORT "; do PORT=$((PORT+1)); done
export PORT_OFFSET=$PORT APP_PORT=$PORT
echo "worktree: $WT"
echo "port:     $PORT (PORT_OFFSET/APP_PORT)"
echo 'naechste Schritte im neuen Fenster:'
echo "  source scripts/env-resolve.sh   # SHARED DB, gleiche Connection"
echo "  bash scripts/agent-lock.sh claim branch $NAME --worktree $WT --label tmux"
if [ -n "${TMUX:-}" ]; then
  tmux new-window -c "$WT" -n "$NAME"
else
  echo "ausserhalb tmux: tmux attach oder tmux new -s agents, dann Starter erneut laufen lassen"
fi
