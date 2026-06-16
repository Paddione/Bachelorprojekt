#!/usr/bin/env bash
# scripts/plan-frontmatter-hook.sh — DEPRECATED: Use vda.sh frontmatter instead.
echo "⚠ DEPRECATED: plan-frontmatter-hook.sh is deprecated. Use 'vda.sh frontmatter' instead." >&2
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/vda.sh" frontmatter "$@"
