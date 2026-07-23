#!/usr/bin/env bash
# scripts/guard-bonsai-overwrite.sh
# Guard against bonsai-8b subagents overwriting files with write instead of edit.
#
# Usage (orchestrator mode):
#   guard-bonsai-overwrite.sh <agent-name> <file1> [file2 ...]
#
# Usage (pre-commit mode):
#   guard-bonsai-overwrite.sh check
#
# Detection heuristic:
#   - If a tracked file was reduced to <30% of its HEAD line count → overwrite
#   - If a tracked file was deleted entirely → overwrite
#
# On detection:
#   - Reverts the file via `git checkout HEAD -- <file>`
#   - Logs the incident to .bonsai-write-guard.log
#   - Exits 1 (failure) to alert the caller
#
# Install: chmod +x scripts/guard-bonsai-overwrite.sh

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGFILE="$REPO_ROOT/.bonsai-write-guard.log"
THRESHOLD_PCT=30  # if current lines < THRESHOLD_PCT% of HEAD lines → overwrite

reverted=0
revert_file() {
  local file="$1" agent="$2"
  if git -C "$REPO_ROOT" show HEAD:"$file" >/dev/null 2>&1; then
    git -C "$REPO_ROOT" checkout HEAD -- "$file"
    echo "[$(date -Iseconds)] GUARD:$agent REVERTED $file (overwrite detected)" >> "$LOGFILE"
    echo "  ✗ GUARD:$agent — $file wurde überschrieben → zurückgesetzt (HEAD)" >&2
    reverted=$((reverted + 1))
  fi
}

check_file_overwrite() {
  local file="$1" agent="${2:-bonsai-8b}"
  [ -f "$REPO_ROOT/$file" ] || { revert_file "$file" "$agent"; return; }

  # Compare line count with HEAD
  local head_lines=0 current_lines=0
  head_lines=$(git -C "$REPO_ROOT" show HEAD:"$file" 2>/dev/null | wc -l) || return 0
  current_lines=$(wc -l < "$REPO_ROOT/$file") || return 0

  # Only flag if HEAD had significant content
  [ "$head_lines" -gt 5 ] || return 0

  # If file shrank below threshold, it was overwritten
  if [ "$current_lines" -lt $((head_lines * THRESHOLD_PCT / 100)) ]; then
    echo "  ⚠ GUARD: $file shrank ${head_lines}→${current_lines} Zeilen (<${THRESHOLD_PCT}%)" >&2
    revert_file "$file" "$agent"
  fi
}

# ── pre-commit mode: check staged files ────────────────────────────────
if [ "${1:-}" = "check" ]; then
  agent="${2:-pre-commit}"
  staged_files=$(git -C "$REPO_ROOT" diff --cached --name-only --diff-filter=M 2>/dev/null || true)
  deleted_files=$(git -C "$REPO_ROOT" diff --cached --name-only --diff-filter=D 2>/dev/null || true)

  for file in $deleted_files; do
    echo "  ⚠ GUARD: $file wurde gelöscht (staged) — prüfe auf versehentliche deletion" >&2
    if git -C "$REPO_ROOT" show HEAD:"$file" >/dev/null 2>&1; then
      # Check if a delete was staged but the worktree still has the file
      if [ -f "$REPO_ROOT/$file" ]; then
        echo "  ⚠ GUARD: $file gelöscht staged, aber Datei existiert noch — restoring" >&2
        git -C "$REPO_ROOT" reset HEAD -- "$file" 2>/dev/null || true
        echo "[$(date -Iseconds)] GUARD:pre-commit UNSTAGED-DELETE $file" >> "$LOGFILE"
        reverted=$((reverted + 1))
      fi
    fi
  done

  for file in $staged_files; do
    check_file_overwrite "$file" "$agent"
  done

  if [ "$reverted" -gt 0 ]; then
    echo "  ⚠ BONSAI-WRITE-GUARD: $reverted Datei(en) zurückgesetzt — ein Agent hat write statt edit verwendet." >&2
    echo "  Siehe $LOGFILE für Details." >&2
    exit 1
  fi
  exit 0
fi

# ── orchestrator mode: agent name + file list ─────────────────────────-
agent="${1:-bonsai-unknown}"
shift || true

if [ $# -eq 0 ]; then
  # No explicit files: check all unstaged modified files
  files=$(git -C "$REPO_ROOT" diff --name-only --diff-filter=M 2>/dev/null || true)
else
  files="$*"
fi

for file in $files; do
  check_file_overwrite "$file" "$agent"
done

if [ "$reverted" -gt 0 ]; then
  echo >&2 ""
  echo "  ╔══════════════════════════════════════════════════════════════╗" >&2
  echo "  ║  🤖 BONSAI-WRITE-GUARD: $reverted Datei(en) von $agent  ║" >&2
  echo "  ║  wurden überschrieben und zurückgesetzt.                    ║" >&2
  echo "  ║  Der Agent hat write statt edit verwendet.                  ║" >&2
  echo "  ╚══════════════════════════════════════════════════════════════╝" >&2
  exit 1
fi
exit 0
