#!/usr/bin/env bash
# Emit active OpenSpec change proposals as plan context, plus OpenSpec SSOT specs for
# files touched vs main (when --with-openspec is passed).
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
CHANGES_DIR="$REPO_ROOT/openspec/changes"
found=0

for proposal_file in "$CHANGES_DIR"/*/proposal.md; do
    [[ -f "$proposal_file" ]] || continue
    slug=$(basename "$(dirname "$proposal_file")")
    [[ "$slug" == "archive" ]] && continue

    title="$slug"
    tasks_file="$(dirname "$proposal_file")/tasks.md"

    echo "### Active proposal: $slug"
    echo
    cat "$proposal_file"
    if [[ -f "$tasks_file" ]]; then
        echo
        echo "#### Implementation tasks"
        cat "$tasks_file"
    fi
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
    exit 0
fi
