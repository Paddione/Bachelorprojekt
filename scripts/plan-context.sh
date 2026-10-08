#!/usr/bin/env bash
# Emit active staged plans as context, filtered by role.
# Usage: scripts/plan-context.sh <role>
set -euo pipefail

# Hardcoded role → domain-allowlist. SSOT: AGENTS.md lines 7-18
# (Agent Routing table). Keep in sync manually.
# Special marker "__ALL__" disables filtering (orchestrator / fail-soft
# for unknown roles). Empty string is the unknown-role signal.
_role_allowlist() {
    case "$1" in
        bachelorprojekt-website)   echo "website frontend design ui svelte astro css brett" ;;
        # Ohne ihn faellt jedes Proposal mit dieser Domain durch den Corpus-Guard
        # T002614 und faerbt damit main rot [T016598].
        bachelorprojekt-ops)       echo "ops llm llm-local-dev k8s observability monitoring factory-watchdog infra-monitoring" ;;
        bachelorprojekt-infra)     echo "infra deploy deployment k3d kustomize prod environments taskfile fleet-operations" ;;
        # Gleiche Lehre wie llm-local-dev oben (T016598): ohne den Token faellt
        # jedes Proposal mit dieser Domain durch den Corpus-Guard T002614.
        # T901017: `agents`-Token aufgenommen (UNANCHORED worker-machine-format,
        # domains: [agents]) — gleiche Lehre, bp-ship spiegelt die Test-Union.
        bachelorprojekt-test)      echo "test tests testing bats playwright factory qa devflow plan-authoring ticket-mcp ticket-ops scripts scripts-infra ci-cd ci dev-tooling agent-skills agents" ;;
        bachelorprojekt-db)        echo "db postgres tracking timeline database" ;;
        bachelorprojekt-security)  echo "security secrets keycloak oidc sealed-secret dsgvo credentials" ;;
        # T900858: thin domain primaries over the OMO engine. Unions of the
        # merged domains so `plan-context.sh bp-*` (AGENTS.md + agent files)
        # filters instead of falling back to __ALL__.
        bp-build)                  echo "infra deploy deployment k3d kustomize prod environments taskfile fleet-operations security secrets keycloak oidc sealed-secret dsgvo credentials" ;;
        bp-run)                    echo "ops llm llm-local-dev k8s observability monitoring factory-watchdog infra-monitoring db postgres tracking timeline database" ;;
        bp-ship)                   echo "website frontend design ui svelte astro css brett test tests testing bats playwright factory qa devflow plan-authoring ticket-mcp ticket-ops scripts scripts-infra ci-cd ci dev-tooling agent-skills agents" ;;
        # T900794: schmale Ops-Rolle des OpenClaw-Harness (GPU-Host, Gateway/CLI).
        # Kein db-Tracking (bleibt bp-run), kein Plan-Authoring (bleibt bp-ship).
        openclaw-ops)              echo "ops llm llm-local-dev k8s observability monitoring" ;;
        orchestrator)              echo "__ALL__" ;;
        *)
            printf 'WARN: unknown role "%s" — including all proposals as fail-soft\n' "$1" >&2
            echo "__ALL__"
            ;;
    esac
}

# Union of every role's allowlist plus the role names themselves —
# the shared domain vocabulary. Excludes orchestrator/__ALL__. Used by
# --vocab and by the dead-domains WARN (anchor check). SSOT: _role_allowlist.
_domain_roles() {
    printf '%s\n' "bachelorprojekt-website" "bachelorprojekt-ops" "bachelorprojekt-infra" \
        "bachelorprojekt-test" "bachelorprojekt-db" "bachelorprojekt-security" \
        "bp-build" "bp-run" "bp-ship" "openclaw-ops"
}

_vocabulary_union() {
    local role
    {
        for role in $(_domain_roles); do
            echo "$role"
            _role_allowlist "$role"
        done
    } | tr ' ' '\n' | grep -v '^$' | sort -u | paste -sd ' ' -
}

FULL=0
args=("$@")
new_args=()
for arg in "${args[@]}"; do
    if [[ "$arg" == "--full" ]]; then
        FULL=1
    else
        new_args+=("$arg")
    fi
done
set -- "${new_args[@]}"
# --vocab: print the union domain vocabulary as a token list (SSOT for
# corpus guards). Must precede the ROLE requirement — checked first.
if [[ "${1:-}" == "--vocab" ]]; then
    _vocabulary_union
    exit 0
fi
ROLE="${1:?Usage: plan-context.sh <role>}"
shift

REPO_ROOT="$(git rev-parse --show-toplevel)"
PLANS_DIR="$REPO_ROOT/.agents/plans"
CHANGES_DIR="$PLANS_DIR"
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
# Union-Vokabular einmal pro Lauf (WARN-Ankerprüfung).
VOCAB_UNION="$(_vocabulary_union)"
found=0

for proposal_file in "$CHANGES_DIR"/*/proposal.md; do
    [[ -f "$proposal_file" ]] || continue
    slug=$(basename "$(dirname "$proposal_file")")
    [[ "$slug" == "archive" ]] && continue

    proposal_domains="$(_parse_yaml_domains "$proposal_file")"

    if [[ -z "$proposal_domains" ]]; then
        printf 'WARN: legacy proposal without domains frontmatter: %s\n' "$slug" >&2
        [[ "$allowlist" != "__ALL__" ]] && continue
    elif [[ "$allowlist" != "__ALL__" && -n "$allowlist" ]]; then
        # Schnittmenge proposal.domains ∩ allowlist prüfen.
        # Selbst-Match: ein Token, das exakt $ROLE ist, matcht immer.
        match=0
        for d in $proposal_domains; do
            if [[ "$d" == "$ROLE" ]]; then
                match=1
                break
            fi
            case " $allowlist " in
                *" $d "*) match=1; break ;;
            esac
        done
        if [[ "$match" -eq 0 ]]; then
            # Fail-loud: still exkludierte Proposals ohne jeglichen Anker in
            # der Vokabular-Union warnen — Slash-Token sind Pfad-Verweise und
            # zählen nie als Anker. (__ALL__-Läufe erreichen diesen Zweig nicht.)
            anchored=0
            for d in $proposal_domains; do
                [[ "$d" == */* ]] && continue
                case " $VOCAB_UNION " in
                    *" $d "*) anchored=1; break ;;
                esac
            done
            if [[ "$anchored" -eq 0 ]]; then
                printf 'WARN: proposal %s has domains [%s] matching no role allowlist — excluded for every role\n' \
                    "$slug" "$proposal_domains" >&2
            fi
            continue
        fi
    fi
    # allowlist == __ALL__ (orchestrator / unknown-role fail-soft) → kein Filter.

    title="$slug"
    tasks_file="$(dirname "$proposal_file")/tasks.md"

    if [[ "$FULL" -eq 1 ]]; then
        echo "### Active proposal: $slug"
        echo
        cat "$proposal_file"
        if [[ -f "$tasks_file" ]]; then
            echo
            echo "#### Implementation tasks"
            cat "$tasks_file"
        fi
        change_dir="$(dirname "$proposal_file")"
        if [[ -d "$change_dir/tasks.d" ]]; then
            for partial in "$change_dir"/tasks.d/*.md; do
                [[ -f "$partial" ]] || continue
                echo
                echo "#### Partial: $(basename "$partial" .md)"
                cat "$partial"
            done
        fi
        if [[ -f "$change_dir/design.md" ]]; then
            echo
            echo "#### Design"
            cat "$change_dir/design.md"
        fi
    else
        echo "### Active proposal: $slug"
        echo
        desc=$(sed -n '/^# Proposal: .*$/{n;p;q;d}' "$proposal_file" | grep -v '^$' | grep -v '^#' | head -1 | xargs || true)
        echo "$desc"
        echo
        if [[ -f "$tasks_file" ]]; then
            headings=$(grep "^## " "$tasks_file" || true)
            if [[ -n "$headings" ]]; then
                echo "#### Implementation tasks"
                echo "$headings"
            fi
        fi
        echo
        echo "Full plan: $proposal_file --full"
    fi
    echo
    found=$((found+1))
done

if [[ $found -eq 0 ]]; then
    exit 0
fi
