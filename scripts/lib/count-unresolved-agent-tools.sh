#!/usr/bin/env bash
# scripts/lib/count-unresolved-agent-tools.sh
# [T002494] Count unresolved agent tools across agent definitions.
#
# Usage: count-unresolved-agent-tools.sh [agents_dir] [registry_yaml]
# Defaults:
#   agents_dir:    .claude/agents
#   registry_yaml: docs/agent-guide/registry/mcp.yaml
#
# Output: Print count of unresolved tools to stdout (integer).
# Exit code:
#   0 on success
#   2 if parameters/registry are invalid or Python dependencies missing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

AGENTS_DIR="${1:-$REPO_ROOT/.claude/agents}"
REGISTRY_YAML="${2:-$REPO_ROOT/docs/agent-guide/registry/mcp.yaml}"

if [ ! -d "$AGENTS_DIR" ] || [ ! -f "$REGISTRY_YAML" ]; then
  exit 2
fi

# Load MCP server keys from registry using Python safe_load
VALID_SERVERS_JSON=$(python3 -c "
import sys, json, yaml
try:
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f) or {}
    clients = data.get('clients', {})
    print(json.dumps(list(clients.keys())))
except Exception as e:
    sys.exit(2)
" "$REGISTRY_YAML" 2>/dev/null) || exit 2

HELPERS_DIR="$REPO_ROOT/tests/spec/helpers"
AGENT_TOOLS_PY="$HELPERS_DIR/agent-tools.py"

if [ ! -f "$AGENT_TOOLS_PY" ]; then
  exit 2
fi

UNRESOLVED_COUNT=0

# Iterate over .md files in AGENTS_DIR
shopt -s nullglob
MD_FILES=("$AGENTS_DIR"/*.md)
shopt -u nullglob

for file in "${MD_FILES[@]}"; do
  [ -f "$file" ] || continue

  # Check if file has a tools: key
  if grep -qE '^tools:( *$| *\[)' "$file"; then
    entries=$(python3 "$AGENT_TOOLS_PY" "$file" 2>/dev/null) || exit 2

    if [ -z "$entries" ]; then
      # State (a): tools: key exists, but resolves to empty list
      UNRESOLVED_COUNT=$((UNRESOLVED_COUNT + 1))
      continue
    fi

    # Process each tool entry
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue

      # State (b): check mcp__ format
      if [[ "$entry" =~ ^mcp__([a-zA-Z0-9_-]+)__ ]]; then
        server="${BASH_REMATCH[1]}"
        # Check if server is in VALID_SERVERS_JSON
        is_valid=$(python3 -c "
import sys, json
servers = json.loads(sys.argv[1])
server = sys.argv[2]
print('1' if server in servers else '0')
" "$VALID_SERVERS_JSON" "$server" 2>/dev/null) || exit 2

        if [ "$is_valid" != "1" ]; then
          UNRESOLVED_COUNT=$((UNRESOLVED_COUNT + 1))
        fi
      elif [[ "$entry" =~ ^mcp_ ]]; then
        # Misformatted legacy mcp_ name (e.g. mcp_postgres_query instead of mcp__mcp-postgres__query)
        UNRESOLVED_COUNT=$((UNRESOLVED_COUNT + 1))
      fi
    done <<< "$entries"
  fi
done

echo "$UNRESOLVED_COUNT"
