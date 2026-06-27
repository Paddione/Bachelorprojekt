#!/usr/bin/env bash
# dotfiles/install.sh — Install harness configs to their correct locations on a new machine.
# Run after: git clone + git-crypt unlock
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DOTFILES="${REPO}/dotfiles"

install_file() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "  ✓ $(basename "$src") → ${dst}"
}

echo "Installing harness configs from ${DOTFILES} ..."

# OpenCode global provider/model config
install_file "${DOTFILES}/opencode/config.json" "${HOME}/.config/opencode/config.json"

# Agy (Antigravity) global settings: env vars, permissions, hooks, MCP
install_file "${DOTFILES}/agy/settings.json" "${HOME}/.gemini/antigravity-cli/settings.json"

# Openclaw: LM Studio endpoint config
install_file "${DOTFILES}/openclaw/.env" "${HOME}/.openclaw/.env"

echo ""
echo "Done. Notes for new machine setup:"
echo "  1. Paths reference /home/patrick — update dotfiles/agy/settings.json if username differs."
echo "  2. codebase-memory-mcp install -y   (registers MCP in all harnesses)"
echo "  3. Key rotation: GITHUB_PAT + Braintrust keys exist in TWO places:"
echo "       .claude/settings.json  (canonical)"
echo "       dotfiles/agy/settings.json  (copy for Agy — update both after rotation)"
