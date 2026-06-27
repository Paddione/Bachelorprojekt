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
echo "Done. Note: paths inside settings.json reference /home/patrick — update if username differs."
echo "Also run: codebase-memory-mcp install -y   (registers MCP in all harnesses)"
