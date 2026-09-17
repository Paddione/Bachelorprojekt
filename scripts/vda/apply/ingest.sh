#!/usr/bin/env bash
# scripts/vda/apply/ingest.sh — Ingest job postings into applications.jobs (Phase 1, T900228)
#
# Usage:
#   scripts/vda/apply/ingest.sh --file <path> [--company <name>] [--role <title>] [--url <url>]
#   scripts/vda/apply/ingest.sh --company <name> --role <title> --raw-text <text> [--requirements <req>]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Source DB resolution helpers
if [[ -f "${REPO_ROOT}/scripts/factory/lib.sh" ]]; then
  source "${REPO_ROOT}/scripts/factory/lib.sh"
  factory_resolve >/dev/null 2>&1 || true
fi

FILE=""
COMPANY=""
ROLE=""
SOURCE_URL=""
REQUIREMENTS=""
RAW_TEXT=""

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

# Execute INSERT with parameter substitution
SQL_INSERT="INSERT INTO applications.jobs (company, role_title, source_url, raw_text, requirements, status)
VALUES (:'company', :'role_title', NULLIF(:'source_url', ''), :'raw_text', NULLIF(:'requirements', ''), 'found')
ON CONFLICT (company, role_title) DO NOTHING
RETURNING id;"

RETURNING_ID=""
if [[ -n "${FACTORY_PG_URL:-}" ]]; then
  RETURNING_ID="$(echo "$SQL_INSERT" | psql "$FACTORY_PG_URL" -qtA -v ON_ERROR_STOP=1 \
    -v company="$COMPANY" \
    -v role_title="$ROLE" \
    -v source_url="$SOURCE_URL" \
    -v raw_text="$RAW_TEXT" \
    -v requirements="$REQUIREMENTS" | tr -d '[:space:]')"
else
  pod="$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running -o name 2>/dev/null | head -1)"
  if [[ -z "$pod" ]]; then
    echo "Error: no running shared-db pod found" >&2
    exit 1
  fi
  RETURNING_ID="$(echo "$SQL_INSERT" | kubectl exec -i "$pod" -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
    -c postgres -- psql -U website -d website -qtA -v ON_ERROR_STOP=1 \
    -v company="$COMPANY" \
    -v role_title="$ROLE" \
    -v source_url="$SOURCE_URL" \
    -v raw_text="$RAW_TEXT" \
    -v requirements="$REQUIREMENTS" 2>/dev/null | tr -d '[:space:]')"
fi

if [[ -z "$RETURNING_ID" ]]; then
  echo "Duplicate: ${COMPANY}/${ROLE} already ingested" >&2
  exit 0
fi

echo "Ingested job: id=${RETURNING_ID} (${ROLE} @ ${COMPANY})"
exit 0
