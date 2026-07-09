#!/usr/bin/env bash
set -euo pipefail

# scripts/agent-model-select.sh
# Interactive CLI tool using fzf to change an agent's model in .opencode/agent-models.jsonc

if ! command -v fzf &>/dev/null; then
  echo "Error: fzf is not installed." >&2
  echo "Please install it using: sudo apt install fzf" >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$REPO_DIR/.opencode/agent-models.jsonc"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: config file $CONFIG_FILE not found." >&2
  exit 1
fi

# Clean config of comments for jq
CLEAN_JSON=$(sed -E 's/^[[:space:]]*\/\/.*$//g' "$CONFIG_FILE")

# 1. Select Agent
AGENT=$(echo "$CLEAN_JSON" | jq -r '.agent | keys[]' | fzf --prompt="Select agent to configure: ")
if [[ -z "$AGENT" ]]; then
  echo "No agent selected. Aborting."
  exit 0
fi

# 2. Select Model Key
MODEL_KEY=$(echo "$CLEAN_JSON" | jq -r '.provider.lmstudio.models | keys[]' | fzf --prompt="Select model for $AGENT: ")
if [[ -z "$MODEL_KEY" ]]; then
  echo "No model selected. Aborting."
  exit 0
fi

FULL_MODEL="lmstudio/$MODEL_KEY"

# 3. Write back to .opencode/agent-models.jsonc
TEMP_OUT=$(mktemp)
trap 'rm -f "$TEMP_OUT"' EXIT

jq --arg agent "$AGENT" --arg model "$FULL_MODEL" '.agent[$agent].model = $model' <(echo "$CLEAN_JSON") > "$TEMP_OUT"
mv "$TEMP_OUT" "$CONFIG_FILE"

echo "Updated $AGENT model to $FULL_MODEL in $CONFIG_FILE"

# 4. Invoke sync script
bash "$REPO_DIR/scripts/opencode-sync-agents.sh"
