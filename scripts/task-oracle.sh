#!/usr/bin/env bash
# scripts/task-oracle.sh — DEPRECATED: Use vda.sh oracle instead.
echo "⚠ DEPRECATED: task-oracle.sh is deprecated. Use 'vda.sh oracle' instead." >&2
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/vda.sh" oracle "$@"
