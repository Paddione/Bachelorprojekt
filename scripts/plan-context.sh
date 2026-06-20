#!/usr/bin/env bash
# Emit active plan sections relevant to <role> from docs/superpowers/plans/*.md
# and OpenSpec SSOT context for files touched vs main (when --with-openspec is passed).
# Usage:
#   scripts/plan-context.sh <role>
#   scripts/plan-context.sh <role> --with-openspec [<file>...]
# Output: markdown block ready to wrap in <active-plans>...</active-plans>
set -euo pipefail

ROLE="${1:?Usage: plan-context.sh <role> [--with-openspec [<file>...]]}"
shift
WITH_OPENSPEC=0
OPENSPEC_FILES=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --with-openspec) WITH_OPENSPEC=1; shift ;;
        *) OPENSPEC_FILES+=("$1"); shift ;;
    esac
done

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

# Optional: append OpenSpec SSOT context for touched components
if [[ $WITH_OPENSPEC -eq 1 ]]; then
    openspec_out=""
    if [[ ${#OPENSPEC_FILES[@]} -gt 0 ]]; then
        openspec_out=$(bash "$REPO_ROOT/scripts/openspec-context.sh" "${OPENSPEC_FILES[@]}" 2>/dev/null || true)
    else
        openspec_out=$(bash "$REPO_ROOT/scripts/openspec-context.sh" 2>/dev/null || true)
    fi
    if [[ -n "$openspec_out" ]]; then
        echo "### OpenSpec SSOT context"
        echo
        echo "$openspec_out"
        found=$((found+1))
    fi
fi

if [[ $found -eq 0 ]]; then
    exit 0  # no output — orchestrator omits the <active-plans> block
fi
