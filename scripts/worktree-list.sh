#!/usr/bin/env bash
# scripts/worktree-list.sh — welche Worktrees existieren gerade?
#
# Die gemeinsame Abfrage für alle Harnesses (Claude Code, codex, opencode, agy).
# Der ORT ist konventionell (`.worktrees/<slug>`, siehe scripts/worktree-create.sh
# und .opencode/worktree.jsonc); die AKTUELLE LISTE ist es nicht — sie steht in
# der git-Registrierung. Harnesses sollen den Ort deshalb nicht konfiguriert
# bekommen, sondern ihn erfragen.
#
# Genau eine Menge: die Worktrees dieser Maschine (interaktive Sessions).
# [T900728] Die zweite Menge — der Repo-Clone auf der PVC des früheren
# Runner-Pods (T016422) — ist mit dem Factory-Teardown entfallen; `--all`
# gibt es nicht mehr. Die verbindende Klammer bleibt der Branch, nicht der Pfad:
# agent-lock.sh sperrt Branches.
#
# Usage:
#   scripts/worktree-list.sh [--json]
#
#   --json  maschinenlesbar (für Hooks, Statuszeilen)
#
# Exit-Codes: 0 = Liste ausgegeben · 2 = Aufruf-/Umgebungsfehler (kein Git-Repo)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/worktree-set.sh
. "$SCRIPT_DIR/lib/worktree-set.sh"

JSON=0
while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=1 ;;
    -h|--help)
      sed -n '2,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "worktree-list.sh: unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "worktree-list.sh: kein Git-Repository — keine Worktree-Menge ableitbar" >&2
  exit 2
}

# Claim-Status kommt von agent-lock.sh, nicht aus einer eigenen Lock-Auswertung:
# ob ein Lock noch lebt, entscheidet dort `_reapable` (Heartbeat-TTL, SID- und
# PID-Liveness). Eine Kopie dieser Logik hier würde irgendwann anders urteilen
# als der Guard, der tatsächlich blockiert.
_claim_state() {  # <worktree-pfad>
  local wt="$1" out
  out="$(bash "$SCRIPT_DIR/agent-lock.sh" check-worktree-live "$wt" 2>/dev/null)"
  case "$out" in
    live) echo "live" ;;
    free) echo "free" ;;
    *)    echo "?" ;;
  esac
}

_json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# ── Ausgabe ─────────────────────────────────────────────────────────────────
if [ "$JSON" -eq 1 ]; then
  printf '{\n  "local": [\n'
  first=1
  while IFS=$'\t' read -r path branch head; do
    [ -n "$path" ] || continue
    [ "$first" -eq 1 ] || printf ',\n'
    first=0
    printf '    {"path": "%s", "branch": "%s", "head": "%s", "claim": "%s"}' \
      "$(_json_escape "$path")" "$(_json_escape "$branch")" \
      "$(_json_escape "$head")" "$(_claim_state "$path")"
  done < <(worktree_set_rows "$REPO_ROOT")
  [ "$first" -eq 0 ] && printf '\n'
  printf '  ]\n'
  printf '}\n'
  exit 0
fi

printf '%-52s %-38s %s\n' PFAD BRANCH CLAIM
while IFS=$'\t' read -r path branch head; do
  [ -n "$path" ] || continue
  printf '%-52s %-38s %s\n' "$path" "${branch:-(kein branch)}" "$(_claim_state "$path")"
done < <(worktree_set_rows "$REPO_ROOT")

echo ""
echo "Wer hält was: bash scripts/agent-lock.sh list  ·  Prozesse: … activity"
exit 0
