#!/usr/bin/env bash
# scripts/vda/apply/ingest.sh — Ingest job postings into applications.jobs (Phase 1, T900228)
#
# Usage:
#   scripts/vda/apply/ingest.sh --file <path> [--company <name>] [--role <title>] [--url <url>]
#   scripts/vda/apply/ingest.sh --company <name> --role <title> --raw-text <text> [--requirements <req>]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Source shared DB helper
source "${REPO_ROOT}/scripts/lib/application-pipeline-db.sh"

FILE=""
COMPANY=""
ROLE=""
SOURCE_URL=""
REQUIREMENTS=""
RAW_TEXT=""
STATUS="found"

show_help() {
  cat <<'HELP'
Usage: scripts/vda/apply/ingest.sh [options]

Options:
  --file <path>             Path to job posting text/markdown file
  --company <name>          Company name (overrides heuristic from file)
  --role <title>            Job role/title (overrides heuristic from file)
  --url, --source-url <url> Source job URL
  --requirements <req>      Extracted requirements text
  --raw-text <text>         Raw job description text (when not using --file)
  --status <status>         Initial status (default: found)
  -h, --help                Show this help
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      FILE="${2:-}"
      shift 2
      ;;
    --company)
      COMPANY="${2:-}"
      shift 2
      ;;
    --role)
      ROLE="${2:-}"
      shift 2
      ;;
    --url|--source-url)
      SOURCE_URL="${2:-}"
      shift 2
      ;;
    --requirements)
      REQUIREMENTS="${2:-}"
      shift 2
      ;;
    --raw-text)
      RAW_TEXT="${2:-}"
      shift 2
      ;;
    --status)
      STATUS="${2:-found}"
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

if [[ -n "$FILE" ]]; then
  if [[ ! -f "$FILE" ]]; then
    echo "Error: file not found: $FILE" >&2
    exit 1
  fi
  RAW_TEXT="$(cat "$FILE")"

  FIRST_LINE="$(head -n 1 "$FILE" | tr -d '\r')"
  if [[ -z "$ROLE" || -z "$COMPANY" ]]; then
    if [[ "$FIRST_LINE" =~ ^(.*)[[:space:]]+@[[:space:]]+(.*)$ ]]; then
      [[ -z "$ROLE" ]] && ROLE="${BASH_REMATCH[1]}"
      [[ -z "$COMPANY" ]] && COMPANY="${BASH_REMATCH[2]}"
    elif [[ "$FIRST_LINE" =~ ^(.*)[[:space:]]+-[[:space:]]+(.*)$ ]]; then
      [[ -z "$ROLE" ]] && ROLE="${BASH_REMATCH[1]}"
      [[ -z "$COMPANY" ]] && COMPANY="${BASH_REMATCH[2]}"
    fi
  fi

  if [[ -z "$REQUIREMENTS" ]]; then
    REQ_MATCH="$(grep -iE '^(Requirements|Anforderungen):' "$FILE" | head -1 | sed -E 's/^(Requirements|Anforderungen):[[:space:]]*//' || true)"
    if [[ -n "$REQ_MATCH" ]]; then
      REQUIREMENTS="$REQ_MATCH"
    fi
  fi

  if [[ -z "$SOURCE_URL" ]]; then
    URL_MATCH="$(grep -oE 'https?://[^[:space:]]+' "$FILE" | head -1 || true)"
    if [[ -n "$URL_MATCH" ]]; then
      SOURCE_URL="$URL_MATCH"
    fi
  fi
fi

# Trim whitespace
ROLE="$(echo "${ROLE:-}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
COMPANY="$(echo "${COMPANY:-}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

if [[ -z "$COMPANY" || -z "$ROLE" ]]; then
  echo "Error: could not determine company and role_title (use --company and --role or provide valid file header)" >&2
  exit 1
fi

if [[ -z "$RAW_TEXT" ]]; then
  RAW_TEXT="${ROLE} @ ${COMPANY}"
fi

RESULT="$(app_pipeline_upsert_job "$COMPANY" "$ROLE" "$SOURCE_URL" "$RAW_TEXT" "$REQUIREMENTS" "$STATUS")"

if [[ "$RESULT" == "DUPLICATE" ]]; then
  echo "Duplicate: ${COMPANY}/${ROLE} already ingested" >&2
  exit 0
fi

echo "Ingested job: id=${RESULT} (${ROLE} @ ${COMPANY})"
exit 0
