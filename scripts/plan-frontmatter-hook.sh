#!/usr/bin/env bash
# Append YAML frontmatter to a plan file that doesn't have it yet.
# Usage: scripts/plan-frontmatter-hook.sh <plan.md>
# Prompts for domains interactively; non-interactive falls back to empty array.
set -euo pipefail

FILE="${1:?Usage: plan-frontmatter-hook.sh <plan.md>}"

# Already has frontmatter?
if head -1 "$FILE" | grep -q '^---'; then
    echo "Frontmatter already present in $FILE — nothing to do."
    exit 0
fi

VALID_DOMAINS="infra website db ops test security"

if [[ -t 0 ]]; then
    echo "Enter domains for $(basename "$FILE") (space-separated from: $VALID_DOMAINS):"
    read -r domains_input
elif read -r -t 1 domains_input 2>/dev/null; then
    : # piped stdin was read successfully
else
    domains_input=""
fi

# Convert "infra db" → "[infra, db]"
if [[ -n "$domains_input" ]]; then
    domains_yaml="[$(echo "$domains_input" | tr ' ' '\n' | sed 's/.*/, &/' | tr -d '\n' | sed 's/^, //')]"
else
    domains_yaml="[]"
fi

slug=$(basename "$FILE" .md)
title=$(grep -m1 '^# ' "$FILE" | sed 's/^# //' || echo "$slug")

FRONTMATTER="---
title: $title
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
