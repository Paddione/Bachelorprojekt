#!/usr/bin/env bash
# Append YAML frontmatter to a plan file that doesn't have it yet.
# Usage: scripts/plan-frontmatter-hook.sh <plan.md>
# Derives domains from plan content; interactive mode allows manual override.
set -euo pipefail

FILE="${1:?Usage: plan-frontmatter-hook.sh <plan.md>}"

# Already has frontmatter?
if head -1 "$FILE" | grep -q '^---'; then
    echo "Frontmatter already present in $FILE — nothing to do."
    exit 0
fi

# Derive domains from plan content — mirrors CLAUDE.md agent routing signals.
# Interactive mode shows the derived set and allows override.
_derive_domains() {
    local file="$1"
    local content
    content=$(cat "$file")
    local domains=()

    echo "$content" | grep -qiE 'website/|astro|svelte|component|homepage|kore|brand|css|ui|frontend' \
        && domains+=(website)
    echo "$content" | grep -qiE 'k3d/|prod[-/]|manifest|kustomize|overlay|Taskfile|environments/|deploy.*k8s' \
        && domains+=(infra)
    echo "$content" | grep -qiE 'database|postgresql|psql|schema|query|backup.*db|restore.*db|tickets\.|v_timeline' \
        && domains+=(db)
    echo "$content" | grep -qiE 'pod |logs |kubectl|deployment|crash|CrashLoop|health.*check' \
        && domains+=(ops)
    echo "$content" | grep -qiE 'tests/|\.bats|\.spec\.ts|playwright|runner\.sh|BATS|FA-|SA-|NFA-|AK-' \
        && domains+=(test)
    echo "$content" | grep -qiE 'SealedSecret|Keycloak|OIDC|DSGVO|credentials|rotate|certificate|secret' \
        && domains+=(security)

    printf '%s\n' "${domains[@]}"
}

derived_domains=$(_derive_domains "$FILE" | tr '\n' ' ' | sed 's/ $//')
domains_input="$derived_domains"

if [[ -t 0 ]]; then
    echo "Derived domains for $(basename "$FILE"): [${derived_domains:-none}]"
    echo "Press Enter to accept, or type override (space-separated from: infra website db ops test security):"
    read -r override_input
    [[ -n "$override_input" ]] && domains_input="$override_input"
fi

# Convert "infra db" → "[infra, db]"
if [[ -n "$domains_input" ]]; then
    domains_yaml="[$(echo "$domains_input" | tr ' ' '\n' | grep -v '^$' | sed 's/.*/, &/' | tr -d '\n' | sed 's/^, //')]"
else
    domains_yaml="[]"
fi

slug=$(basename "$FILE" .md)
title=$(grep -m1 '^# ' "$FILE" | sed 's/^# //' || echo "$slug")

FRONTMATTER="---
title: $title
ticket_id: null
domains: $domains_yaml
status: active
pr_number: null
---
"

# Prepend frontmatter to file
tmpfile=$(mktemp)
printf '%s\n' "$FRONTMATTER" > "$tmpfile"
cat "$FILE" >> "$tmpfile"
mv "$tmpfile" "$FILE"
echo "Added frontmatter to $FILE"
