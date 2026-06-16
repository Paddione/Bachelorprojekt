#!/usr/bin/env bash
# scripts/brainstorm-bridge.sh — DEPRECATED: Use vda.sh brainstorm instead.
echo "⚠ DEPRECATED: brainstorm-bridge.sh is deprecated. Use 'vda.sh brainstorm' instead." >&2
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/vda.sh" brainstorm "$@"
