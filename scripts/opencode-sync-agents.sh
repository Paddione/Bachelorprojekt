#!/usr/bin/env bash
set -euo pipefail

# scripts/opencode-sync-agents.sh
# Idempotently merges .opencode/agent-models.jsonc into ~/.config/opencode/opencode.jsonc

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="$REPO_DIR/.opencode/agent-models.jsonc"
TARGET_FILE="${OPENCODE_CONFIG:-$HOME/.config/opencode/opencode.jsonc}"

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "Error: source config $SOURCE_FILE not found." >&2
  exit 1
fi

if [[ ! -f "$TARGET_FILE" ]]; then
  mkdir -p "$(dirname "$TARGET_FILE")"
  echo '{"provider":{"lmstudio":{"models":{}}},"agent":{}}' > "$TARGET_FILE"
fi

# Strip comments starting with //
CLEAN_SRC=$(sed -E 's/^[[:space:]]*\/\/.*$//g' "$SOURCE_FILE")
CLEAN_TGT=$(sed -E 's/^[[:space:]]*\/\/.*$//g' "$TARGET_FILE")

TEMP_OUT=$(mktemp)
trap 'rm -f "$TEMP_OUT"' EXIT

jq -s '
  .[1].agent = .[0].agent |
  .[1].provider.lmstudio.models = (.[1].provider.lmstudio.models // {}) + .[0].provider.lmstudio.models |
  .[1]
' <(echo "$CLEAN_SRC") <(echo "$CLEAN_TGT") > "$TEMP_OUT"

mv "$TEMP_OUT" "$TARGET_FILE"
echo "Successfully synced agent models to $TARGET_FILE"
