#!/usr/bin/env bash
# Parse a plan .md file → tracking/pending/plan-<slug>.json
set -euo pipefail

FILE="${1:?Usage: plans-parse.sh <path/to/plan.md>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"

mkdir -p "$REPO_ROOT/tracking/pending"

slug=$(basename "$FILE" .md)
out="$REPO_ROOT/tracking/pending/plan-${slug}.json"

python3 "$REPO_ROOT/scripts/plans-parse.py" "$FILE" > "$out"
echo "wrote $out"
