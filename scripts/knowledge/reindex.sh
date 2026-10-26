#!/usr/bin/env bash
# Run the appropriate knowledge ingestion script.
# Usage: SOURCE=prs|markdown|bugs|context7|all PGURL=... bash reindex.sh
#
# NOTE: SOURCE=all ist Quellen-Ingest, kein vollstaendiger Modell-Reindex:
# Custom-/Web-/Coaching-Bestaende fehlen dort. Der additive 768D-Reindex
# aller gespeicherten Chunktexte laeuft ueber den dense-migration-Pfad:
#   SOURCE=dense PGURL=... bash reindex.sh prepare --run-id <id>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="${SOURCE:-all}"

run() {
  echo "[knowledge/reindex] running ingest-${1}.mjs..."
  node "${SCRIPT_DIR}/ingest-${1}.mjs"
}

run_context7() {
  echo "[knowledge/reindex] running context7 ingest for all context7_docs collections..."
  psql "${PGURL}" -At -c \
    "SELECT id || '|' || (crawl_config->>'libraryId') || '|' || COALESCE(crawl_config->>'tokens', '20000')
       FROM knowledge.collections
      WHERE source = 'context7_docs'
        AND crawl_config->>'libraryId' IS NOT NULL" \
  | while IFS='|' read -r col_id lib_id tokens; do
      echo "[knowledge/reindex] context7: ${lib_id} → ${col_id}"
      COLLECTION_ID="${col_id}" LIBRARY_ID="${lib_id}" TOKENS="${tokens}" \
        node "${SCRIPT_DIR}/ingest-context7.mjs"
    done
}

case "$SOURCE" in
  prs)      run prs ;;
  markdown) run markdown ;;
  bugs)     run bug-tickets ;;
  context7) run_context7 ;;
  dense)
    echo "[knowledge/reindex] running dense-migration.mjs $*..."
    node "${SCRIPT_DIR}/dense-migration.mjs" "$@"
    ;;
  all)
    run prs
    run markdown
    run bug-tickets
    run_context7
    ;;
  *)
    echo "Unknown SOURCE='$SOURCE'. Use: prs|markdown|bugs|context7|all|dense" >&2
    exit 1
    ;;
esac
