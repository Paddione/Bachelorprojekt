#!/usr/bin/env bash
# SSOT: openspec/changes/hermes-agent-mcp-access/tasks.md (Task 3)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY_SCRIPT="${SCRIPT_DIR}/hermes-mcp-servers.yaml"
YQ="/usr/local/bin/yq"

CONFIG_FILE="${HOME}/.hermes/config.yaml"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) CONFIG_FILE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

mkdir -p "$(dirname "$CONFIG_FILE")"

if [[ ! -f "$REGISTRY_SCRIPT" ]]; then
  echo "ERROR: Registry not found at $REGISTRY_SCRIPT" >&2
  exit 1
fi

EXISTING_CONFIG=$(cat "$CONFIG_FILE" 2>/dev/null || true)

if [[ "$DRY_RUN" == true ]]; then
  echo "=== DRY RUN ===" >&2
  MERGED=$($YQ eval-all 'select(fileIndex == 0) *+ select(fileIndex == 1)' <(cat "$REGISTRY_SCRIPT") <(echo "$EXISTING_CONFIG") 2>/dev/null || echo "{}")
  echo "$MERGED" | $YQ '.mcp_servers' >&2
else
  TMP_FILE=$(mktemp "${CONFIG_FILE}.tmp.XXXXXX")
  $YQ eval-all 'select(fileIndex == 0) *+ select(fileIndex == 1)' <(cat "$REGISTRY_SCRIPT") <(echo "$EXISTING_CONFIG") > "$TMP_FILE"
  mv "$TMP_FILE" "$CONFIG_FILE"
  echo "Provisioned $(yq eval '.mcp_servers | keys | length' "$CONFIG_FILE") servers to $CONFIG_FILE" >&2
fi
