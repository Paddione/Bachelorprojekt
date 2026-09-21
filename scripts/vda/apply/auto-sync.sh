#!/usr/bin/env bash
# scripts/vda/apply/auto-sync.sh — Auto-sync job postings into the application pipeline (Phase 5, T900231)
#
# Reads job postings from a JSON file, ingests them into the database,
# automatically runs match scoring, and optionally generates dossiers.
#
# Usage:
#   scripts/vda/apply/auto-sync.sh --json <path> [--match] [--render [--theme <name>]] [--dry-run]
#   scripts/vda/apply/auto-sync.sh --dir <path> [--file-pattern <pat>] [--match] [--render [--theme <name>]] [--dry-run]
#   scripts/vda/apply/auto-sync.sh --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Source auto-sync library
source "${REPO_ROOT}/scripts/lib/application-pipeline-auto-sync.sh"

JSON_PATH=""
DIR_PATH=""
FILE_PATTERN=""
DRY_RUN=false
RUN_MATCH=true
RUN_RENDER=true
THEME="default"

show_help() {
  cat <<'HELP'
Usage: scripts/vda/apply/auto-sync.sh [options]

Auto-syncs job postings into the application pipeline database.

Options:
  --json <path>           Path to job postings JSON file (or --dir)
  --dir <path>            Path to directory with job posting files
  --file-pattern <pat>    File pattern for directory sync (default: *.txt *.md)
  --match                 Enable automatic match scoring (default: on)
  --no-match              Disable automatic match scoring
  --render                Enable automatic dossier generation (default: on)
  --no-render             Disable automatic dossier generation
  --theme <name>          Theme for dossier generation (default: default)
  --dry-run               Preview changes without writing to DB
  -h, --help              Show this help

JSON file format (examples/job-postings.json):
  {
    "jobs": [
      {
        "company": "Acme Corp",
        "role": "Senior DevOps Engineer",
        "source_url": "https://acme.com/careers/devops",
        "requirements": "Kubernetes CI/CD Python Terraform",
        "status": "found"
      }
    ]
  }
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)
      JSON_PATH="${2:-}"; shift 2 ;;
    --dir)
      DIR_PATH="${2:-}"; shift 2 ;;
    --file-pattern)
      FILE_PATTERN="${2:-}"; shift 2 ;;
    --match)
      RUN_MATCH=true; shift ;;
    --no-match)
      RUN_MATCH=false; shift ;;
    --render)
      RUN_RENDER=true; shift ;;
    --no-render)
      RUN_RENDER=false; shift ;;
    --theme)
      THEME="${2:-default}"; shift 2 ;;
    --dry-run)
      DRY_RUN=true; shift ;;
    -h|--help)
      show_help; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2; show_help >&2; exit 2 ;;
  esac
done

if [[ -z "$JSON_PATH" && -z "$DIR_PATH" ]]; then
  echo "Error: --json or --dir is required" >&2
  show_help >&2
  exit 1
fi

if [[ -n "$JSON_PATH" && -n "$DIR_PATH" ]]; then
  echo "Error: use --json OR --dir, not both" >&2
  exit 1
fi

main() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "=== DRY RUN MODE ==="
  fi

  if [[ -n "$JSON_PATH" ]]; then
    _do_sync_from_json "$JSON_PATH"
  fi

  if [[ -n "$DIR_PATH" ]]; then
    _do_sync_from_dir "$DIR_PATH"
  fi

  echo ""
  echo "=== Auto-Sync Complete ==="
}

_do_sync_from_json() {
  local json_path="$1"
  echo "=== Auto-Sync from JSON: ${json_path} ==="

  if [[ "$DRY_RUN" == "true" ]]; then
    app_pipeline_sync_json_file "$json_path" "true"
    return 0
  fi

  if [[ "$RUN_MATCH" == "true" ]]; then
    app_pipeline_sync_json_file "$json_path"
    echo ""
    echo "=== Auto-Match ==="
    _run_auto_match
    if [[ "$RUN_RENDER" == "true" ]]; then
      echo ""
      echo "=== Auto-Render ==="
      _run_auto_render
    fi
  else
    app_pipeline_sync_json_file "$json_path"
  fi
}

_do_sync_from_dir() {
  local dir_path="$1"
  local file_pattern="$2"
  echo "=== Auto-Sync from directory: ${dir_path} ==="

  if [[ "$DRY_RUN" == "true" ]]; then
    app_pipeline_sync_directory "$dir_path" "$file_pattern" "true"
    return 0
  fi

  if [[ "$RUN_MATCH" == "true" ]]; then
    app_pipeline_sync_directory "$dir_path" "$file_pattern"
    echo ""
    echo "=== Auto-Match ==="
    _run_auto_match
    if [[ "$RUN_RENDER" == "true" ]]; then
      echo ""
      echo "=== Auto-Render ==="
      _run_auto_render
    fi
  else
    app_pipeline_sync_directory "$dir_path" "$file_pattern"
  fi
}

_run_auto_match() {
  local job_ids
  job_ids="$(app_pipeline_exec_sql "SELECT id FROM applications.jobs;" 2>/dev/null || true)"
  if [[ -n "$job_ids" ]]; then
    while IFS= read -r jid; do
      [[ -z "$jid" ]] && continue
      app_pipeline_auto_match "$jid" 2>/dev/null || true
    done <<< "$job_ids"
  fi
}

_run_auto_render() {
  local job_ids
  job_ids="$(app_pipeline_exec_sql "SELECT id FROM applications.jobs WHERE status IN ('drafting', 'applied');" 2>/dev/null || true)"
  if [[ -n "$job_ids" ]]; then
    while IFS= read -r jid; do
      [[ -z "$jid" ]] && continue
      app_pipeline_auto_render "$jid" "$THEME" 2>/dev/null || true
    done <<< "$job_ids"
  else
    echo "No jobs in drafting/applied status — skipping render."
  fi
}

main "$@"
