#!/usr/bin/env bash
# scripts/vda/apply/import-bootstrap.sh — Bootstrap import of existing application dossiers (T900228)
#
# Usage:
#   scripts/vda/apply/import-bootstrap.sh --dir <path> [--status <status>] [--applied-at <YYYY-MM-DD>]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Source shared DB helper
source "${REPO_ROOT}/scripts/lib/application-pipeline-db.sh"

DIR=""
STATUS="found"
EVENT_AT=""

show_help() {
  cat <<'HELP'
Usage: scripts/vda/apply/import-bootstrap.sh --dir <path> [options]

Options:
  --dir <path>            Directory containing application files (required)
  --status <status>       Job status to assign (default: found)
  --event-at <date>       Event date (e.g. 2026-09-15) for initial timeline entry (default: now())
  --applied-at <date>     Alias for --event-at
  -h, --help              Show this help
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      DIR="${2:-}"
      shift 2
      ;;
    --status)
      STATUS="${2:-found}"
      shift 2
      ;;
    --event-at|--applied-at)
      EVENT_AT="${2:-}"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      show_help >&2
      exit 2
      ;;
  esac
done

if [[ -z "$DIR" ]]; then
  echo "Error: --dir <path> is required" >&2
  show_help >&2
  exit 1
fi

if [[ ! -d "$DIR" ]]; then
  echo "Error: directory not found: $DIR" >&2
  exit 1
fi

COUNT_IMPORTED=0
COUNT_DUPLICATE=0

# Process all Anschreiben_*.pdf files in DIR
while IFS= read -r file; do
  [[ -f "$file" ]] || continue

  basename_file="$(basename "$file")"
  # Remove .pdf / .PDF extension
  base_no_ext="${basename_file%.*}"

  # Pattern: Anschreiben_<Firma>_<Rolle>
  if [[ "$base_no_ext" =~ ^Anschreiben_([^_]+)_(.+)$ ]]; then
    company="${BASH_REMATCH[1]}"
    role="${BASH_REMATCH[2]}"
  else
    echo "Skipping non-matching file: $basename_file (expected Anschreiben_<Firma>_<Rolle>.pdf)"
    continue
  fi

  raw_text="(Bootstrap-Import, Details siehe lokale Bewerbungsunterlagen)"
  job_res="$(app_pipeline_upsert_job "$company" "$role" "" "$raw_text" "" "$STATUS")"

  if [[ "$job_res" == "DUPLICATE" ]]; then
    echo "Duplicate: ${company}/${role} already present, skipping"
    COUNT_DUPLICATE=$((COUNT_DUPLICATE + 1))
    continue
  fi

  job_id="$job_res"
  abs_path="$(realpath "$file")"

  # Register cover letter dossier
  app_pipeline_insert_dossier "$job_id" "$abs_path" "cover_letter" >/dev/null

  # Register timeline event (event_type matches job status, created_at is EVENT_AT or now())
  app_pipeline_insert_timeline "$job_id" "$STATUS" "Bootstrap import from $basename_file" "$EVENT_AT" >/dev/null

  echo "Imported: ${company} — ${role} (job_id=${job_id})"
  COUNT_IMPORTED=$((COUNT_IMPORTED + 1))
done < <(find "$DIR" -maxdepth 1 -iname 'Anschreiben_*.pdf' | sort)

echo "Bootstrap import finished: ${COUNT_IMPORTED} imported, ${COUNT_DUPLICATE} duplicates skipped."
exit 0
