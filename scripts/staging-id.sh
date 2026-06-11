#!/usr/bin/env bash
# scripts/staging-id.sh
# Convert a git branch name into a DNS-safe STAGING_ID.
# Rules:
#   - Strip leading refs/heads/
#   - Lowercase
#   - Replace non-[a-z0-9] with '-'
#   - Collapse consecutive dashes
#   - Strip leading/trailing dashes
#   - Truncate to 20 chars
#   - If result starts with a digit, prepend 's'
# Usage: bash scripts/staging-id.sh "feature/T000616-staging-on-demand"
# Output: t000616-staging-on (printed to stdout, no newline)
set -euo pipefail

BRANCH="${1:?Branch name required}"

# Strip refs/heads/ prefix if present
BRANCH="${BRANCH#refs/heads/}"

ID=$(printf '%s' "$BRANCH" \
  | tr '[:upper:]' '[:lower:]' \
  | sed 's|[^a-z0-9]|-|g' \
  | sed 's|-\{2,\}|-|g' \
  | sed 's|^-||;s|-$||' \
  | cut -c1-20 \
  | sed 's|-$||')

# Must start with a letter
case "$ID" in
  [0-9]*) ID="s${ID:0:19}" ;;
esac

# Ensure non-empty
if [[ -z "$ID" ]]; then
  echo "staging-id.sh: cannot derive STAGING_ID from branch '${1}'" >&2
  exit 1
fi

printf '%s' "$ID"
