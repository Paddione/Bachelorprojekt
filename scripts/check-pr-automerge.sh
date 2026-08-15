#!/bin/bash
set -euo pipefail

usage() {
  echo "Nutzung: $0 [--pr <PR-Nummer>] [--branch <Branch-Name>]" >&2
  echo "  --pr <number>     Die PR-Nummer" >&2
  echo "  --branch <name>    Der Branch-Name (Standard: aktueller Branch)" >&2
  echo "  -h, --help         Zeigt diese Hilfe an" >&2
}

# Default values
PR_NUM=""
BRANCH=""

# Parsing arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr)
      if [[ -n "${2:-}" ]]; then
        PR_NUM="$2"
        shift 2
      else
        echo "Fehler: --pr erfordert eine Nummer." >&2
        usage
        exit 2
      fi
      ;;
    --branch)
      if [[ -n "${2:-}" ]]; then
        BRANCH="$2"
        shift 2
      else
        echo "Fehler: --branch erfordert einen Namen." >&2
        usage
        exit 2
      fi
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Fehler: Unbekannte Option $1" >&2
      usage
      exit 2
      ;;
  esac
done

# Check if gh is installed
if ! command -v gh >/dev/null 2>&1; then
  echo "Fehler: 'gh' CLI ist nicht installiert." >&2
  exit 2
fi

# Check if jq is installed
if ! command -v jq >/dev/null 2>&1; then
  echo "Fehler: 'jq' ist nicht installiert." >&2
  exit 2
fi

# Determine target for gh pr view
if [[ -n "$PR_NUM" ]]; then
  TARGET="$PR_NUM"
elif [[ -n "$BRANCH" ]]; then
  TARGET="$BRANCH"
else
  TARGET=""
fi

# Execute gh command and capture output/error
set +e
if [[ -z "$TARGET" ]]; then
  OUTPUT=$(gh pr view --json number,autoMergeRequest 2>&1)
else
  OUTPUT=$(gh pr view "$TARGET" --json number,autoMergeRequest 2>&1)
fi
STATUS=$?
set -e

# Case 1: command failed
if [[ $STATUS -ne 0 ]]; then
  if [[ "$OUTPUT" == *"no pull requests found"* ]]; then
    echo "OK: Kein PR gefunden."
    exit 0
  else
    echo "Fehler bei 'gh pr view': $OUTPUT" >&2
    exit 2
  fi
fi

# Case 2: command succeeded, now check autoMergeRequest
IS_AUTO_MERGE=$(echo "$OUTPUT" | jq -r '.autoMergeRequest')

if [[ "$IS_AUTO_MERGE" == "null" ]]; then
  echo "OK: Kein Auto-Merge aktiv."
  exit 0
else
  PR_NUMBER=$(echo "$OUTPUT" | jq -r '.number')
  echo "BLOCK: Auto-Merge ist auf PR #$PR_NUMBER aktiv"
  exit 1
fi
