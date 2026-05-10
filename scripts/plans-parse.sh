#!/usr/bin/env bash
# Parse a plan .md file → tracking/pending/plan-<slug>.json
set -euo pipefail

FILE="${1:?Usage: plans-parse.sh <path/to/plan.md>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"

mkdir -p "$REPO_ROOT/tracking/pending"

slug=$(basename "$FILE" .md)
out="$REPO_ROOT/tracking/pending/plan-${slug}.json"

# Stage to a temp file so a parser failure (e.g. plan missing YAML frontmatter)
# never leaves a 0-byte JSON behind for the tracking-import cron to choke on.
# shellcheck disable=SC2155
tmp=$(mktemp)
if python3 "$REPO_ROOT/scripts/plans-parse.py" "$FILE" > "$tmp"; then
    mv "$tmp" "$out"
    echo "wrote $out"
else
    rm -f "$tmp"
    echo "ERROR: plans-parse.py failed for $FILE — no JSON written" >&2
    exit 1
fi
