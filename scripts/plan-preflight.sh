#!/usr/bin/env bash
# scripts/plan-preflight.sh — fail-closed Plan-Stage-Guards als Subkommandos. [T003267]
#
# Warum: Die Pre-Commit-Checks aus dev-flow-plan Schritt 5 (T001268, Lock-Fallback
# T003102) und der Merged-Preflight (T002279) existierten nur als Markdown-Snippets,
# die jede Runtime (Claude Code, opencode, agy, Factory) einzeln kopieren musste —
# mit dokumentierter Guard-Drift im opencode-Pfad. Dieses Skript ist der eine
# ausfuehrbare Ort; die Skill-Prosa erklaert das Warum, das Skript erzwingt das Was.
#
# Verwendung:
#   plan-preflight.sh pre-commit   --ticket <TICKET_EXT_ID>
#   plan-preflight.sh pre-worktree --ticket <TICKET_EXT_ID>
#
# Exit: 0 = alle Checks gruen · 1 = Guard verletzt · 2 = Usage-/Umgebungsfehler.
# Jede Fehlermeldung ist EINE Zeile: was fehlt + welcher Befehl es behebt.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "Usage: ${0##*/} {pre-commit|pre-worktree} --ticket <TICKET_EXT_ID>" >&2
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
  # Erlaubt: Pfade unter tests/ und openspec/changes/ sowie exakt
  # website/src/data/openspec-status.json und website/src/data/test-inventory.json.
  # Unstaged/untracked ist fuer den Commit irrelevant und wird nicht geprueft.
  local staged foreign
  staged="$(git diff --cached --name-only)"
  foreign="$(printf '%s\n' "$staged" | grep -v -E '^(tests/|openspec/changes/|website/src/data/openspec-status\.json$|website/src/data/test-inventory\.json$)' || true)"
  [ -z "$foreign" ] \
    || fail "Fremd-Datei im Staged-Set: $(printf '%s' "$foreign" | tr '\n' ' ') — Abhilfe: 'git restore --staged <pfad>' und nur Plan-Artefakte stagen (tests/, openspec/changes/, website/src/data/openspec-status.json, website/src/data/test-inventory.json)."

  command -v jq >/dev/null 2>&1 \
    || envfail "jq fehlt (wird fuer das .branch-Feld der Lock-Datei gebraucht) — Abhilfe: sudo apt-get install -y jq."
  local toplevel common lock_dir slug lock_file claimed
  toplevel="$(git rev-parse --show-toplevel)"
  common="$(cd "$toplevel" && git rev-parse --git-common-dir)"
  case "$common" in /*) : ;; *) common="$(cd "$toplevel/$common" && pwd)";; esac
  lock_dir="${AGENT_LOCK_DIR:-$common/agent-locks}"
  slug="${branch//\//-}"
  lock_file="$lock_dir/ticket__${TICKET}.json"
  [ -f "$lock_file" ] || lock_file="$lock_dir/branch__${slug}.json"
  [ -f "$lock_file" ] \
    || fail "kein agent-lock-Claim fuer $TICKET (weder ticket__${TICKET}.json noch branch__${slug}.json in $lock_dir) — Abhilfe: bash scripts/agent-lock.sh claim ticket $TICKET --label dev-flow-plan --worktree . ."
  claimed="$(jq -r '.branch // empty' "$lock_file" 2>/dev/null || true)"
  [ "$claimed" = "$branch" ] \
    || fail "Branch-Mismatch: Lock $(basename "$lock_file") traegt branch='$claimed', HEAD='$branch' — Abhilfe: bash scripts/agent-lock.sh claim ticket $TICKET --branch $branch (refresht den eigenen Claim mit korrektem Branch)."
  echo "plan-preflight pre-commit: OK (branch=$branch, lock=$(basename "$lock_file"), ticket=$TICKET)"
  exit 0
}

# === pre-worktree: check-merged-Wrapper [T002279] ===
cmd_pre_worktree() {
  local rc=0
  bash "$SCRIPT_DIR/agent-lock.sh" check-merged "$TICKET" || rc=$?
  case "$rc" in
    0) ;;  # nicht auf main — check-merged hat "safe to proceed" bereits gemeldet
    1) echo "FEHLER: $TICKET ist bereits auf main gemergt — Abhilfe: bash scripts/ticket.sh update-status --id $TICKET --status done --resolution shipped und KEINEN Worktree anlegen." >&2 ;;
    *) echo "FEHLER: check-merged Umgebungsfehler (rc=$rc, origin/main fehlt oder ID-Format) — Abhilfe: git fetch origin main und erneut ausfuehren." >&2 ;;
  esac
  exit "$rc"
}

# === main dispatch ===
SUBCMD="${1:-}"; shift 2>/dev/null || true
TICKET=""
while [ $# -gt 0 ]; do case "$1" in
  --ticket) TICKET="${2:-}"; shift 2 2>/dev/null || usage;;
  *) echo "FEHLER: unbekanntes Argument '$1'" >&2; usage;;
esac; done

[ -n "$TICKET" ] || usage
case "$TICKET" in
  T[0-9][0-9][0-9][0-9][0-9][0-9]) : ;;
  *) envfail "Ticket-ID '$TICKET' hat nicht das Format T###### — Abhilfe: die external_id aus 'bash scripts/ticket.sh get --id <id>' verwenden." ;;
esac

case "$SUBCMD" in
  pre-commit)   cmd_pre_commit ;;
  pre-worktree) cmd_pre_worktree ;;
  *) usage ;;
esac
