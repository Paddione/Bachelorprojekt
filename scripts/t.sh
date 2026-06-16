#!/usr/bin/env bash
# scripts/t.sh — DEPRECATED: Use vda.sh ticket instead.
echo "⚠ DEPRECATED: t.sh is deprecated. Use 'vda.sh ticket' instead." >&2
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/vda.sh" ticket "$@"
