#!/usr/bin/env bash
# Run the appropriate knowledge ingestion script.
# Usage: SOURCE=prs|markdown|bugs|all PGHOST=... PGPASSWORD=... bash reindex.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="${SOURCE:-all}"

run() {
  echo "[knowledge/reindex] running ingest-${1}.mjs..."
  node "${SCRIPT_DIR}/ingest-${1}.mjs"
}

case "$SOURCE" in
  prs)      run prs ;;
  markdown) run markdown ;;
  bugs)     run bug-tickets ;;
  all)
    run prs
    run markdown
    run bug-tickets
    ;;
  *)
    echo "Unknown SOURCE='$SOURCE'. Use: prs|markdown|bugs|all" >&2
    exit 1
    ;;
esac
