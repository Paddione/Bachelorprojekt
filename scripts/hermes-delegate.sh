#!/usr/bin/env bash
# Delegates a single, cheap-inference prompt to the local Hermes Agent
# (gemma-4-12b-qat via LM Studio) instead of spending an expensive model's
# tokens on project. Intended for mechanical, low-risk subtasks. NOT for anything
# needing judgment or untrusted tool execution.
#
# Usage: scripts/hermes-delegate.sh "<prompt>" [--with-project-mcp]
#   --with-project-mcp: Enable provisioned MCP servers (strictly opt-in)
set -euo pipefail

HERMES="${HERMES:-$HOME/.local/bin/hermes}"
PROMPT="${1:?usage: hermes-delegate.sh \"<prompt>\" [--with-project-mcp]}"
WITH_PROJECT_MCP=false

# Parse optional --with-project-mcp flag (must be last positional arg)
shift 0 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-project-mcp) WITH_PROJECT_MCP=true ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

if [[ ! -x "$HERMES" ]]; then
  echo "FATAL: hermes binary not found at $HERMES" >&2
  exit 1
fi

# Default: explicit no tool access (-t "") per Tier-0 policy  
if [[ "$WITH_PROJECT_MCP" == true ]]; then
  # Opt-in path: remove -t "" suppression to activate provisioned MCP servers
  exec "$HERMES" --cli -z "$PROMPT"
fi

exec "$HERMES" --cli -z "$PROMPT" -t ""
