#!/usr/bin/env bash
# scripts/plan-preflight.sh — fail-closed Plan-Stage-Guards als Subkommandos. [T003267]
#
# Warum: Die Pre-Commit-Checks aus dev-flow-plan Schritt 5 (T001268, Lock-Fallback
# T003102) und der Merged-Preflight (T002279) existierten nur als Markdown-Snippets,
# die jede Runtime (Claude Code, opencode, agy, Factory) einzeln kopieren musste —
# mit dokumentierter Guard-Drift im opencode-Pfad. Dieses Skript ist der eine
# ausfuehrbare Ort; die Skill-Prosa erklaert das Warum, das Skript erzwingt das Was.
#
# Ticket-Pfad retiriert 2026-10-14: nur noch --branch, kein --ticket, kein stage-plan.
#
# Verwendung:
#   plan-preflight.sh pre-commit   --branch <branch>
#   plan-preflight.sh pre-worktree --branch <slug-oder-symptom>
#
# Exit: 0 = alle Checks gruen · 1 = Guard verletzt · 2 = Usage-/Umgebungsfehler.
# Jede Fehlermeldung ist EINE Zeile: was fehlt + welcher Befehl es behebt.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "Usage: ${0##*/} {pre-commit|pre-worktree} --branch <name>" >&2
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
    || fail "kein agent-lock-Claim fuer branch $branch ($lock_file in $lock_dir fehlt) — Abhilfe: bash scripts/agent-lock.sh claim branch $branch --label dev-flow-plan --worktree . ."
  claimed="$(jq -r '.branch // empty' "$lock_file" 2>/dev/null || true)"
  [ "$claimed" = "$branch" ] \
    || fail "Branch-Mismatch: Lock $(basename "$lock_file") traegt branch='$claimed', HEAD='$branch' — Abhilfe: bash scripts/agent-lock.sh claim branch $branch (refresht den eigenen Claim mit korrektem Branch)."
  echo "plan-preflight pre-commit: OK (branch=$branch, lock=$(basename "$lock_file"))"
  exit 0
}

# === pre-worktree: merged-Check via Branch-Historie [T002279] ===
cmd_pre_worktree() {
  local hits
  git fetch origin main --quiet 2>/dev/null || true
  git rev-parse --verify --quiet origin/main >/dev/null \
    || envfail "origin/main fehlt — Abhilfe: git fetch origin main und erneut ausfuehren."
  hits="$(git log origin/main --oneline --grep="$BRANCH" 2>/dev/null | head -5 || true)"
  if [ -n "$hits" ]; then
    echo "FEHLER: '$BRANCH' steht bereits auf main gemergt — KEINEN Worktree anlegen." >&2
    printf '%s\n' "$hits" >&2
    exit 1
  fi
  echo "pre-worktree: OK (kein Merge von '$BRANCH' auf origin/main gefunden)."
  exit 0
}

# === main dispatch ===
SUBCMD="${1:-}"; shift 2>/dev/null || true
BRANCH=""
while [ $# -gt 0 ]; do case "$1" in
  --branch) BRANCH="${2:-}"; shift 2 2>/dev/null || usage;;
  --ticket) envfail "Ticket-System retiriert (2026-10-14) — nutze --branch <name> statt --ticket <id>.";;
  *) echo "FEHLER: unbekanntes Argument '$1'" >&2; usage;;
esac; done

[ -n "$BRANCH" ] || usage

case "$SUBCMD" in
  pre-commit)   cmd_pre_commit ;;
  pre-worktree) cmd_pre_worktree ;;
  *) usage ;;
esac
