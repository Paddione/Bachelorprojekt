#!/usr/bin/env bash
# stray-secret-dump-guard.sh
# Detects stray Kubernetes Secret dump files (kind=Secret, 128+ Keys) in a
# working tree — independent of gitleaks. Fail-closed: exit 0 = clean,
# exit 1 = stray file(s) found, exit 2 = usage/runtime error.
#
# T900027 (security, major) — ein vollständiges K8s Secret-Manifest
# (inkl. ANTHROPIC_API_KEY, OIDC-Client-Secrets, Admin-Passwörter) lag
# untracked im Repo-Root unter einem Windows-Pfad-Mangle-Namen.
# .gitignore / git check-ignore können den Namen nicht auflösen;
# gitleaks ist fail-open bei fehlendem Binary.
#
# Usage: scripts/stray-secret-dump-guard.sh [--dir <path>] [--verbose]
#
# Bypass: SKIP_STRAY_SECRET_GUARD=1

set -euo pipefail

# --- Defaults ---
SCAN_DIR=""
VERBOSE=0

# --- Argument parsing ---
while [ $# -gt 0 ]; do
  case "$1" in
    --dir)
      if [ $# -lt 2 ]; then
        echo "ERROR: --dir requires an argument" >&2
        exit 2
      fi
      SCAN_DIR="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=1
      shift
      ;;
    --help|-h)
      echo "Usage: stray-secret-dump-guard.sh [--dir <path>] [--verbose]"
      echo "  --dir      Target directory to scan (default: git rev-parse --show-toplevel)"
      echo "  --verbose  Print found file paths to stdout (stderr always)"
      echo "  --help     Show this help"
      exit 0
      ;;
    *)
      echo "ERROR: unknown option: $1" >&2
      exit 2
      ;;
  esac
done

# --- Resolve scan directory ---
if [ -z "$SCAN_DIR" ]; then
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    SCAN_DIR="$(git rev-parse --show-toplevel)"
  else
    SCAN_DIR="$(pwd)"
    echo "WARNING: not a git repo — scanning $(pwd) (use --dir to specify)" >&2
  fi
fi

if [ ! -d "$SCAN_DIR" ] || [ ! -r "$SCAN_DIR" ]; then
  echo "ERROR: scan directory does not exist or is not readable: $SCAN_DIR" >&2
  exit 2
fi

# --- File name patterns (case-insensitive fnmatch against basename) ---
# These match the incident file patterns and likely variants.
PATTERNS=(
  '*ws-secret*.json'
  '*-secrets-*.json'
  '*secretdump*.json'
  '*secrets-dump*.json'
)

# --- Scan ---
FOUND=0
FOUND_FILES=""

while IFS= read -r -d '' filepath; do
  filename="$(basename "$filepath")"
  for pattern in "${PATTERNS[@]}"; do
    # Case-insensitive match via lowercasing
    lower_name="${filename,,}"
    lower_pattern="${pattern,,}"
    if [[ "$lower_name" == $lower_pattern ]]; then
      FOUND_FILES="$FOUND_FILES
  $filepath"
      echo "FOUND stray secret dump: $filepath" >&2
      FOUND=$((FOUND + 1))
      break  # Don't double-count files matching multiple patterns
    fi
  done
done < <(find "$SCAN_DIR" -type f -print0 2>/dev/null)

# --- Report ---
if [ "$FOUND" -gt 0 ]; then
  if [ "$VERBOSE" -eq 1 ]; then
    echo "" >&2
    echo "=== All stray secret dump files found ===" >&2
    echo "$FOUND_FILES" >&2
  fi
  exit 1
fi

exit 0
