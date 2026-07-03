#!/usr/bin/env bash
# Emit active OpenSpec change proposals as plan context, filtered by the
# supplied <role>, plus OpenSpec SSOT specs for files touched vs main
# (when --with-openspec is passed).
# Usage:
#   scripts/plan-context.sh <role>
#   scripts/plan-context.sh <role> --with-openspec [<file>...]
# Output: markdown block ready to wrap in <active-plans>...</active-plans>
set -euo pipefail

ROLE="${1:?Usage: plan-context.sh <role> [--with-openspec [<file>...]]}"
shift
WITH_OPENSPEC=0
OPENSPEC_FILES=()
SEMANTIC_QUERY=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --with-openspec) WITH_OPENSPEC=1; shift ;;
        --semantic) SEMANTIC_QUERY="$2"; shift 2 ;;
        *) OPENSPEC_FILES+=("$1"); shift ;;
    esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
CHANGES_DIR="$REPO_ROOT/openspec/changes"

# Hardcoded role → domain-allowlist. SSOT: AGENTS.md lines 7-18
# (Agent Routing table). Keep in sync manually.
# Special marker "__ALL__" disables filtering (orchestrator / fail-soft
# for unknown roles). Empty string is the unknown-role signal.
_role_allowlist() {
    case "$1" in
        bachelorprojekt-website)   echo "website frontend design ui svelte astro css brett" ;;
        bachelorprojekt-ops)       echo "ops llm k8s observability livekit monitoring" ;;
        bachelorprojekt-infra)     echo "infra deploy k3d kustomize prod environments taskfile" ;;
        bachelorprojekt-test)      echo "test tests bats playwright factory qa" ;;
        bachelorprojekt-db)        echo "db postgres tracking timeline database" ;;
        bachelorprojekt-security)  echo "security secrets keycloak oidc sealed-secret dsgvo credentials" ;;
        orchestrator)              echo "__ALL__" ;;
        *)
            printf 'WARN: unknown role "%s" — including all proposals as fail-soft\n' "$1" >&2
            echo "__ALL__"
            ;;
    esac
}

# Parse the YAML frontmatter `domains:` field from a proposal (or its
# adjacent tasks.md as a fallback). Returns space-separated domain
# tokens, or empty string if no `domains:` field is present anywhere.
# Explicit `domains: []` is preserved as empty (caller treats it as
# "exclude for all roles" per design spec).
_parse_yaml_domains() {
    local path="$1"
    local dir
    dir="$(dirname "$path")"
    local f content dom
    for f in "$path" "$dir/tasks.md"; do
        [[ -f "$f" ]] || continue
        content=$(awk 'BEGIN{f=0} /^---$/{if(f==0){f=1;next} else if(f==1){exit}} f==1{print}' "$f")
        if printf '%s\n' "$content" | grep -q '^domains:'; then
            dom=$(printf '%s\n' "$content" | sed -n 's/^domains:[[:space:]]*\(.*\)$/\1/p' | head -1)
            # Strip YAML list brackets, then split commas to spaces.
            dom="${dom#[}"
            dom="${dom%]}"
            printf '%s' "$dom" | sed "s/[\"'\`]//g" | tr ',' ' ' | tr -s ' ' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
            return
        fi
    done
}

allowlist="$(_role_allowlist "$ROLE")"
found=0

for proposal_file in "$CHANGES_DIR"/*/proposal.md; do
    [[ -f "$proposal_file" ]] || continue
    slug=$(basename "$(dirname "$proposal_file")")
    [[ "$slug" == "archive" ]] && continue

    proposal_domains="$(_parse_yaml_domains "$proposal_file")"

    if [[ -z "$proposal_domains" ]]; then
        # Legacy: kein `domains:`-Feld in proposal.md oder tasks.md →
        # Default-Include mit WARN (Folge-PR kann migrieren).
        printf 'WARN: legacy proposal without domains frontmatter: %s\n' "$slug" >&2
    elif [[ "$allowlist" != "__ALL__" && -n "$allowlist" ]]; then
        # Schnittmenge proposal.domains ∩ allowlist prüfen.
        match=0
        for d in $proposal_domains; do
            case " $allowlist " in
                *" $d "*) match=1; break ;;
            esac
        done
        [[ "$match" -eq 1 ]] || continue
    fi
    # allowlist == __ALL__ (orchestrator / unknown-role fail-soft) → kein Filter.

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

# Optional: semantic neighbours via /api/openspec/search (fallback: grep-only).
if [[ -n "$SEMANTIC_QUERY" ]]; then
    base="${OPENSPEC_SEARCH_URL:-http://website.website.svc.cluster.local:4321}"
    resp="$(curl -fsS --max-time 5 -G "$base/api/openspec/search" \
              --data-urlencode "q=$SEMANTIC_QUERY" --data-urlencode "limit=3" 2>/dev/null || true)"
    if [[ -n "$resp" ]]; then
        echo "### Semantically similar OpenSpec changes"
        echo
        echo "$resp" | jq -r '.results[]? | "- **\(.slug)** (\(.ticket_id // "no-ticket"), \(.file_type)): \(.snippet)"' 2>/dev/null || true
        echo
        found=$((found+1))
    fi
fi
