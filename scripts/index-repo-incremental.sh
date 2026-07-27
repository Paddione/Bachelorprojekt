#!/usr/bin/env bash
# scripts/index-repo-incremental.sh — Incremental SCS reindex for changed files.
# Usage: bash scripts/index-repo-incremental.sh [file1] [file2] ...
# If no files given, reads from stdin (one path per line).
#
# NOTE: Without an active port-forward to the cluster DB, the incremental
# reindex is a no-op — makePool() in index-repo.ts falls back to
# localhost:5432 where nothing listens, causing ECONNREFUSED. The index
# only becomes current after a full `task scs:index` against the cluster.
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
  (
    cd "$REPO_ROOT" || exit 1
    if ! out=$(timeout 30 npx tsx scripts/index-repo.ts --file "$f" 2>&1); then
      echo "[SCS] WARN: reindex failed for $f" >&2
      echo "$out" | tail -5 >&2
    fi
  )
done
