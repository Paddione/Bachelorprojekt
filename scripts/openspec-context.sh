#!/usr/bin/env bash
# Emit OpenSpec SSOT content for files touched in a branch/commit.
# Usage:
#   scripts/openspec-context.sh                    # auto-detect changed files vs main
#   scripts/openspec-context.sh <file> [<file>...]  # explicit file list
#   scripts/openspec-context.sh --specs <slug> [<slug>...]  # explicit spec slugs
#
# Output: markdown blocks for each matched spec, ready to inject into <active-plans>.
# Exit 0 with no output when no spec matches (orchestrator can omit the block).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SPECS_DIR="$REPO_ROOT/openspec/specs"
MAP_FILE="$REPO_ROOT/openspec/component-map.yaml"

# --- Parse args ---
MODE=auto
FILES=()
EXPLICIT_SPECS=()

if [[ "${1:-}" == "--specs" ]]; then
    MODE=specs
    shift
    EXPLICIT_SPECS=("$@")
elif [[ $# -gt 0 ]]; then
    MODE=files
    FILES=("$@")
fi

# --- Resolve file list ---
if [[ "$MODE" == "auto" ]]; then
    # Changed files vs merge-base with main
    BASE=$(git merge-base HEAD origin/main 2>/dev/null || git rev-parse origin/main 2>/dev/null || echo "HEAD^")
    mapfile -t FILES < <(git diff --name-only "$BASE" HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null || true)
fi

# --- Load mapping from YAML (minimal parser: prefix + spec lines) ---
declare -A PREFIX_TO_SPEC  # prefix -> spec slug
declare -a PREFIX_ORDER    # ordered list of prefixes (file order = longest-first as authored)

while IFS= read -r line; do
    line="${line%%#*}"  # strip comments
    line="${line#"${line%%[! ]*}"}"  # ltrim
    if [[ "$line" == "- prefix:"* ]]; then
        current_prefix="${line#- prefix: }"
        current_prefix="${current_prefix//\'/}"
        current_prefix="${current_prefix//\"/}"
        current_prefix="${current_prefix%"${current_prefix##*[! ]}"}"  # rtrim
    elif [[ "$line" == "spec:"* ]]; then
        spec_slug="${line#spec: }"
        spec_slug="${spec_slug//\'/}"
        spec_slug="${spec_slug//\"/}"
        spec_slug="${spec_slug%"${spec_slug##*[! ]}"}"  # rtrim
        if [[ -n "${current_prefix:-}" && -n "$spec_slug" ]]; then
            PREFIX_TO_SPEC["$current_prefix"]="$spec_slug"
            PREFIX_ORDER+=("$current_prefix")
        fi
    fi
done < "$MAP_FILE"

# --- Match files to specs ---
declare -A MATCHED_SPECS  # dedup

match_file() {
    local f="$1"
    for prefix in "${PREFIX_ORDER[@]}"; do
        if [[ "$f" == "$prefix"* ]]; then
            MATCHED_SPECS["${PREFIX_TO_SPEC[$prefix]}"]=1
            return
        fi
    done
}

if [[ "$MODE" == "specs" ]]; then
    for slug in "${EXPLICIT_SPECS[@]}"; do
        MATCHED_SPECS["$slug"]=1
    done
else
    for f in "${FILES[@]}"; do
        match_file "$f"
    done
fi

# --- Output matched specs ---
if [[ ${#MATCHED_SPECS[@]} -eq 0 ]]; then
    exit 0  # no match — orchestrator omits block
fi

for slug in "${!MATCHED_SPECS[@]}"; do
    spec_file="$SPECS_DIR/${slug}.md"
    if [[ ! -f "$spec_file" ]]; then
        echo "# openspec: $slug (spec file not found: $spec_file)" >&2
        continue
    fi
    echo "## OpenSpec SSOT: $slug"
    echo
    cat "$spec_file"
    echo
done
