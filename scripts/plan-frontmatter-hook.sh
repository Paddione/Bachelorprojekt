#!/usr/bin/env bash
# Ensure a plan file has COMPLETE YAML frontmatter (domains + status) that
# scripts/plan-context.sh can route on.
#   - No frontmatter           → derive domains, prepend a full block.
#   - Frontmatter, complete     → no-op (idempotent).
#   - Frontmatter, incomplete   → repair IN PLACE: fill domains when []/null/
#                                 missing (re-derived from the body), and set
#                                 status: active when missing/null. All other
#                                 fields (title/ticket_id/pr_number) and any
#                                 deliberate non-active status are preserved.
# Usage: scripts/plan-frontmatter-hook.sh <plan.md>
set -euo pipefail

FILE="${1:?Usage: plan-frontmatter-hook.sh <plan.md>}"

CANON_ROLES="infra website db ops test security"

# Derive canonical role tokens from content on stdin (mirrors CLAUDE.md routing).
_derive_domains() {
    local content; content="$(cat)"
    local domains=()
    grep -qiE 'website/|astro|svelte|component|homepage|kore|brand|css|ui|frontend' <<<"$content" && domains+=(website)
    grep -qiE 'k3d/|prod[-/]|manifest|kustomize|overlay|Taskfile|environments/|deploy.*k8s' <<<"$content" && domains+=(infra)
    grep -qiE 'database|postgresql|psql|schema|query|backup.*db|restore.*db|tickets\.|v_timeline' <<<"$content" && domains+=(db)
    grep -qiE 'pod |logs |kubectl|deployment|crash|CrashLoop|health.*check' <<<"$content" && domains+=(ops)
    grep -qiE 'tests/|\.bats|\.spec\.ts|playwright|runner\.sh|BATS|FA-|SA-|NFA-|AK-' <<<"$content" && domains+=(test)
    grep -qiE 'SealedSecret|Keycloak|OIDC|DSGVO|credentials|rotate|certificate|secret' <<<"$content" && domains+=(security)
    printf '%s\n' "${domains[@]}"
}

# space-separated roles -> "[a, b]"; empty -> "[]"
_domains_to_yaml() {
    local input="$1"
    if [[ -n "${input// }" ]]; then
        echo "[$(echo "$input" | tr ' ' '\n' | grep -v '^$' | sed 's/.*/, &/' | tr -d '\n' | sed 's/^, //')]"
    else
        echo "[]"
    fi
}

# true iff line 1 is exactly --- AND a closing --- exists on a later line
_has_frontmatter() {
    [[ "$(head -1 "$FILE")" == "---" ]] || return 1
    awk 'NR==1{next} /^---$/{found=1; exit} END{exit !found}' "$FILE"
}

# content after the closing frontmatter --- (for derivation); whole file if none
_body() {
    if _has_frontmatter; then
        awk 'BEGIN{n=0} /^---$/{n++; next} n>=2{print}' "$FILE"
    else
        cat "$FILE"
    fi
}

# value of KEY inside the frontmatter block (first pair of ---); empty if absent
_fm_field() {
    awk -v key="$1" '
        BEGIN{f=0}
        /^---$/{f++; next}
        f==1 && $0 ~ "^"key":" { sub("^"key":[ \t]*","",$0); print; exit }
    ' "$FILE" | tr -d '\r'
}

slug="$(basename "$FILE" .md)"
title="$(grep -m1 '^# ' "$FILE" | sed 's/^# //' || true)"
[[ -n "$title" ]] || title="$slug"

# ── Case A: no frontmatter → derive, optional interactive override, prepend ──
if ! _has_frontmatter; then
    derived="$(_body | _derive_domains | tr '\n' ' ' | sed 's/ *$//')"
    domains_input="$derived"
    if [[ -t 0 ]]; then
        echo "Derived domains for $(basename "$FILE"): [${derived:-none}]"
        echo "Press Enter to accept, or type override (space-separated from: $CANON_ROLES):"
        read -r override_input
        [[ -n "$override_input" ]] && domains_input="$override_input"
    fi
    domains_yaml="$(_domains_to_yaml "$domains_input")"
    [[ "$domains_yaml" == "[]" ]] && \
        echo "WARNING: no domain signals found — plan will be invisible to every role until domains are set." >&2
    tmpfile="$(mktemp)"
    {
        printf '%s\n' "---"
        printf 'title: %s\n' "$title"
        printf 'ticket_id: null\n'
        printf 'domains: %s\n' "$domains_yaml"
        printf 'status: active\n'
        printf 'pr_number: null\n'
        printf '%s\n\n' "---"
        cat "$FILE"
    } > "$tmpfile"
    mv "$tmpfile" "$FILE"
    echo "Added frontmatter to $FILE"
    exit 0
fi

# ── Case B/C: frontmatter present → check the routing-critical fields ──
dom_raw="$(_fm_field domains | tr -d ' \t\r')"
st_raw="$(_fm_field status | tr -d ' \t\r')"

needs_domains=0
case "$dom_raw" in ""|"[]"|"null") needs_domains=1 ;; esac
needs_status=0
case "$st_raw" in ""|"null") needs_status=1 ;; esac

if [[ "$needs_domains" -eq 0 && "$needs_status" -eq 0 ]]; then
    echo "Frontmatter already complete in $FILE — nothing to do."
    exit 0
fi

derived="$(_body | _derive_domains | tr '\n' ' ' | sed 's/ *$//')"
derived_yaml="$(_domains_to_yaml "$derived")"
[[ "$needs_domains" -eq 1 && "$derived_yaml" == "[]" ]] && \
    echo "WARNING: domains is empty and no signals found in $FILE — set domains manually." >&2

tmpfile="$(mktemp)"
awk -v derived="$derived_yaml" -v needs_dom="$needs_domains" -v needs_st="$needs_status" '
    BEGIN { infm=0; dom_seen=0; st_seen=0 }
    NR==1 && $0=="---" { print; infm=1; next }
    infm==1 && $0=="---" {
        if (needs_dom==1 && dom_seen==0) print "domains: " derived
        if (needs_st==1  && st_seen==0)  print "status: active"
        print; infm=0; next
    }
    infm==1 && $0 ~ /^domains:/ {
        dom_seen=1
        if (needs_dom==1) { print "domains: " derived } else { print }
        next
    }
    infm==1 && $0 ~ /^status:/ {
        st_seen=1
        if (needs_st==1) { print "status: active" } else { print }
        next
    }
    { print }
' "$FILE" > "$tmpfile"
mv "$tmpfile" "$FILE"
echo "Repaired frontmatter in $FILE (domains=$derived_yaml needs_status=$needs_status)"
