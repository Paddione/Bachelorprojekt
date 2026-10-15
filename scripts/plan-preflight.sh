#!/usr/bin/env bash
# scripts/plan-preflight.sh — fail-closed Plan-Stage-Guards als Subkommandos. [T003267]
#
# Warum: Die Pre-Commit-Checks aus dev-flow-plan Schritt 5 (T001268, Branch-Lock
# T003102) existierten nur als Markdown-Snippets,
# die jede Runtime (Claude Code, opencode, agy, Factory) einzeln kopieren musste —
# mit dokumentierter Guard-Drift im opencode-Pfad. Dieses Skript ist der eine
# ausfuehrbare Ort; die Skill-Prosa erklaert das Warum, das Skript erzwingt das Was.
#
# Verwendung:
#   plan-preflight.sh pre-commit
#
# Ohne Ticket-DB: geprueft wird der Branch-Claim agent-locks/branch__<branch>.json.
# --ticket und pre-worktree (check-merged, T002279) sind entfernt und enden mit Exit 2.
#
# Exit: 0 = alle Checks gruen · 1 = Guard verletzt · 2 = Usage-/Umgebungsfehler.
# Jede Fehlermeldung ist EINE Zeile: was fehlt + welcher Befehl es behebt.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "Usage: ${0##*/} pre-commit" >&2
  exit 2
}

# Guard verletzt: eine Zeile, Exit 1.
fail() { echo "FEHLER: $*" >&2; exit 1; }
# Umgebungsfehler: eine Zeile, Exit 2.
envfail() { echo "FEHLER: $*" >&2; exit 2; }

# === pre-commit: nicht-main / clean tree / Lock-Match [T001268, T003102] ===
cmd_pre_commit() {
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" \
    || envfail "kein Git-Repo im aktuellen Verzeichnis — Abhilfe: in den Worktree wechseln (cd .worktrees/<slug>)."
  [ "$branch" != "HEAD" ] \
    || fail "detached HEAD — plan-stage braucht einen Branch; Abhilfe: git checkout <feature-branch>."
  [ "$branch" != "main" ] \
    || fail "HEAD ist 'main' — plan-stage Commits auf main sind verboten; Abhilfe: bash scripts/worktree-create.sh <slug> und dort committen."
  # Staged-Set-Pflicht [T005114]: geprueft wird das Staged-Set — das, was der
  # plan-stage Commit tatsaechlich enthaelt — nicht der gesamte Working-Tree.
  # Erlaubt: Pfade unter tests/ und .agents/plans/ (kanonisch seit C7a) sowie
  # components/website/src/data/test-inventory.json.
  # Unstaged/untracked ist fuer den Commit irrelevant und wird nicht geprueft.
  local staged foreign
  staged="$(git diff --cached --name-only)"
  foreign="$(printf '%s\n' "$staged" | grep -v -E '^(\.agents/plans/|tests/|components/website/src/data/test-inventory\.json$)' || true)"
  [ -z "$foreign" ] \
    || fail "Fremd-Datei im Staged-Set: $(printf '%s' "$foreign" | tr '\n' ' ') — Abhilfe: 'git restore --staged <pfad>' und nur Plan-Artefakte stagen (.agents/plans/, tests/, components/website/src/data/test-inventory.json). Hinweis: docs/code-quality/repo-index.json ist ein regeneriertes Nicht-Freshness-Artefakt, kein Guard-Defekt — Abhilfe: 'git restore docs/code-quality/repo-index.json'."

  command -v jq >/dev/null 2>&1 \
    || envfail "jq fehlt (wird fuer das .branch-Feld der Lock-Datei gebraucht) — Abhilfe: sudo apt-get install -y jq."
  local toplevel common lock_dir slug lock_file claimed
  toplevel="$(git rev-parse --show-toplevel)"
  common="$(cd "$toplevel" && git rev-parse --git-common-dir)"
  # [T016595] Absolut heisst unter Git-Bash auch "C:/..." oder "C:\...":
  # `git rev-parse --git-common-dir` gibt die Windows-Form aus, waehrend die
  # Shell in POSIX-Form arbeitet. Ein blosses /* haelt die Windows-Form fuer
  # relativ und setzt sie hinter $toplevel — ein Pfad aus zwei absoluten
  # Pfaden, an dem `cd` scheitert und `set -e` das Skript beendet.
  case "$common" in
    /*|[A-Za-z]:/*|[A-Za-z]:\\*) : ;;
    *) common="$(cd "$toplevel/$common" && pwd)" ;;
  esac
  lock_dir="${AGENT_LOCK_DIR:-$common/agent-locks}"
  slug="${branch//\//-}"
  lock_file="$lock_dir/branch__${slug}.json"
  [ -f "$lock_file" ] \
    || fail "kein agent-lock-Claim branch__${slug}.json in $lock_dir — Abhilfe: bash scripts/agent-lock.sh claim branch $branch --label dev-flow-plan --worktree ."
  claimed="$(jq -r '.branch // empty' "$lock_file" 2>/dev/null || true)"
  [ "$claimed" = "$branch" ] \
    || fail "Branch-Mismatch: Lock $(basename "$lock_file") traegt branch='$claimed', HEAD='$branch' — Abhilfe: bash scripts/agent-lock.sh claim branch $branch --label dev-flow-plan --worktree . (refresht den eigenen Claim)."
  echo "plan-preflight pre-commit: OK (branch=$branch, lock=$(basename "$lock_file"))"
  exit 0
}

# === main dispatch ===
SUBCMD="${1:-}"; shift 2>/dev/null || true
while [ $# -gt 0 ]; do case "$1" in
  --ticket) envfail "--ticket ist entfernt (Ticket-DB abgeschaltet) — Abhilfe: plan-preflight.sh pre-commit ohne Argumente.";;
  *) echo "FEHLER: unbekanntes Argument '$1'" >&2; usage;;
esac; done

case "$SUBCMD" in
  pre-commit)   cmd_pre_commit ;;
  pre-worktree) envfail "pre-worktree ist entfernt (check-merged braucht Ticket-IDs) — kein Ersatz noetig: worktree-create.sh checkt einen vorhandenen Branch aus." ;;
  *) usage ;;
esac
