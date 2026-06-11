#!/usr/bin/env bash
# scripts/index-repo-incremental.sh — Incremental SCS reindex for changed files.
# Usage: bash scripts/index-repo-incremental.sh [file1] [file2] ...
# If no files given, reads from stdin (one path per line).
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -gt 0 ]]; then
  FILES=("$@")
else
  mapfile -t FILES
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
  exit 0
fi

for f in "${FILES[@]}"; do
  [[ -z "$f" ]] && continue
  [[ -f "$REPO_ROOT/$f" ]] || continue
  echo "[SCS] Reindexing: $f"
  (cd "$REPO_ROOT" && npx tsx scripts/index-repo.ts --file "$f" 2>/dev/null) || true
done
