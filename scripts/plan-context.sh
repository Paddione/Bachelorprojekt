#!/usr/bin/env bash
# Emit active plan sections relevant to <role> from docs/superpowers/plans/*.md
# Usage: scripts/plan-context.sh <role>
# Output: markdown block ready to wrap in <active-plans>...</active-plans>
set -euo pipefail

ROLE="${1:?Usage: plan-context.sh <role>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
PLANS_DIR="$REPO_ROOT/docs/superpowers/plans"
found=0

for plan_file in "$PLANS_DIR"/*.md; do
    [[ -f "$plan_file" ]] || continue

    # Extract status from frontmatter (between first pair of ---)
    status=$(awk 'BEGIN{f=0} /^---/{f++;next} f==1 && /^status:/{print $2; exit}' "$plan_file" | tr -d ' \r')
    [[ "$status" == "active" ]] || continue

    # Extract domains line and check for role
    domains=$(awk 'BEGIN{f=0} /^---/{f++;next} f==1 && /^domains:/{print; exit}' "$plan_file")
    [[ "$domains" == *"$ROLE"* ]] || continue

    title=$(awk 'BEGIN{f=0} /^---/{f++;next} f==1 && /^title:/{$1=""; print; exit}' "$plan_file" | sed 's/^ //')
    echo "### Active plan: $title"
    echo
    # Print body (everything after the closing ---)
    awk 'BEGIN{n=0} /^---/{n++;next} n>=2{print}' "$plan_file"
    echo
    found=$((found+1))
done

if [[ $found -eq 0 ]]; then
    exit 0  # no output — orchestrator omits the <active-plans> block
fi
