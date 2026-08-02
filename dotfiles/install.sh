#!/usr/bin/env bash
# dotfiles/install.sh — Install harness configs + inject secrets from SSOT.
# SSOT: environments/.secrets/dev-tools.yaml (git-crypt encrypted)
# Run after: git clone + git-crypt unlock
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DOTFILES="${REPO}/dotfiles"
SSOT="${REPO}/environments/.secrets/dev-tools.yaml"

# ── SSOT sanity check ──────────────────────────────────────────────────
if [ ! -f "$SSOT" ]; then
  echo "ERROR: SSOT not found at ${SSOT}" >&2
  echo "  Run 'git-crypt unlock /path/to/bp-secrets.key' first." >&2
  exit 1
fi

# Detect if git-crypt is locked by checking the first 10 bytes of the blob.
# Encrypted git-crypt content starts with 0x00 0x47 0x49 0x54 0x43 0x52 0x59 0x50 0x54 0x00
if ! head -c 10 "$SSOT" | od -An -v -tx1 | tr -d ' \n' | grep -q '^00474954435259505400'; then
  # Not encrypted header — file is either plaintext and git-crypt is unlocked (good)
  # or it's something else. The content check below will catch empty/malformed.
  :
fi

# Read secrets from SSOT
GITHUB_TOKEN="$(grep -E '^GITHUB_PERSONAL_ACCESS_TOKEN:' "$SSOT" | sed 's/^GITHUB_PERSONAL_ACCESS_TOKEN:[[:space:]]*"\(.*\)"/\1/' | tr -d '"' )"
BRAINTRUST_KEY="$(grep -E '^BRAINTRUST_API_KEY:' "$SSOT" | sed 's/^BRAINTRUST_API_KEY:[[:space:]]*"\(.*\)"/\1/' | tr -d '"' )"
OPENCODE_KEY="$(grep -E '^OPENCODE_API_KEY:' "$SSOT" | sed 's/^OPENCODE_API_KEY:[[:space:]]*"\(.*\)"/\1/' | tr -d '"' )"
# [T002559] Bis hierher lag BGE_MCP_TOKEN NUR auf dem Host (~/.config/bge-mcp/server.env),
# unversioniert und ohne Backup. Der T002556-Fix kopierte es zusaetzlich nach
# ~/.config/llm-proxy/proxy.env — derselbe Wert an zwei Stellen, per Hand, ohne
# gemeinsame Quelle. Jetzt kommt er aus der SSOT und wird von hier verteilt.
BGE_MCP_TOKEN_VAL="$(grep -E '^BGE_MCP_TOKEN:' "$SSOT" | sed 's/^BGE_MCP_TOKEN:[[:space:]]*"\(.*\)"/\1/' | tr -d '"' )"

if [ -z "$GITHUB_TOKEN" ] || [ -z "$BRAINTRUST_KEY" ] || [ -z "$OPENCODE_KEY" ] || [ -z "$BGE_MCP_TOKEN_VAL" ]; then
  echo "ERROR: one or more required secrets are empty in ${SSOT}" >&2
  echo "  Check that git-crypt is unlocked and the file contains all four keys." >&2
  exit 1
fi

# Schreibt KEY=VALUE in eine Env-Datei — idempotent, 0600, ohne den Wert
# auszugeben. Ein vorhandener Eintrag wird ersetzt, nicht dupliziert: sonst
# gewinnt bei systemd der letzte, und zwei Werte in einer Datei sind nicht
# unterscheidbar.
write_env_var() {  # $1 = Datei, $2 = Schluessel, $3 = Wert
  local file="$1" key="$2" val="$3"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  chmod 0600 "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    local tmp; tmp="$(mktemp)"
    # '|| :' ist Pflicht, nicht Stil: enthaelt die Datei NUR diese eine Zeile,
    # bleibt nach dem Filtern nichts uebrig und grep gibt Exit 1 — unter
    # 'set -e' braeche das Skript hier ab, ausgerechnet im idempotenten Fall.
    grep -v "^${key}=" "$file" > "$tmp" || :
    printf '%s=%s\n' "$key" "$val" >> "$tmp"
    mv "$tmp" "$file"
    chmod 0600 "$file"
  else
    printf '%s=%s\n' "$key" "$val" >> "$file"
  fi
  echo "  ✓ ${key} → ${file}"
}

install_file() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "  ✓ $(basename "$src") → ${dst}"
}

# [T002559] BGE_MCP_TOKEN auf beide Verbraucher verteilen.
#
# llm-proxy braucht es fuer ensureUiConfigRendered(): fehlt es dort, scheitert
# das Rendern still, --ui-config-file zeigt auf eine fehlende Datei, und
# llama-server bricht beim naechsten Loadout-Start hart ab [T002556].
# bge-mcp braucht es fuer die Authentifizierung seiner HTTP-Schnittstelle.
echo "Distributing BGE_MCP_TOKEN from SSOT ..."
write_env_var "${HOME}/.config/llm-proxy/proxy.env" BGE_MCP_TOKEN "$BGE_MCP_TOKEN_VAL"
write_env_var "${HOME}/.config/bge-mcp/server.env"  BGE_MCP_TOKEN "$BGE_MCP_TOKEN_VAL"
echo "  (systemctl --user restart llm-proxy bge-mcp — damit die Units den Wert lesen)"

echo "Installing harness configs from ${DOTFILES} ..."

# ── 1) .claude/settings.json — inject ONLY env secret fields ──────────
# Merge the two SSOT secrets into the env block, leaving all other keys untouched.
CLAUDE_DST="${HOME}/.claude/settings.json"
mkdir -p "$(dirname "$CLAUDE_DST")"
if [ -f "$CLAUDE_DST" ]; then
  jq --arg gh "$GITHUB_TOKEN" --arg bt "$BRAINTRUST_KEY" \
    '.env.GITHUB_PERSONAL_ACCESS_TOKEN = $gh | .env.BRAINTRUST_API_KEY = $bt' \
    "$CLAUDE_DST" > "${CLAUDE_DST}.tmp" && mv "${CLAUDE_DST}.tmp" "$CLAUDE_DST"
  echo "  ✓ .claude/settings.json — env secrets merged (idempotent)"
else
  # No existing config — create minimal with just secrets
  cat > "$CLAUDE_DST" <<JSON
{
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}",
    "BRAINTRUST_API_KEY": "${BRAINTRUST_KEY}"
  }
}
JSON
  echo "  ✓ .claude/settings.json — created with env secrets"
fi

# ── 2) OpenCode global provider/model config — inject apiKey only ────
OC_DST="${HOME}/.config/opencode/config.json"
if [ -f "$OC_DST" ]; then
  jq --arg key "$OPENCODE_KEY" \
    '.provider.opencode.options.apiKey = $key' \
    "$OC_DST" > "${OC_DST}.tmp" && mv "${OC_DST}.tmp" "$OC_DST"
  echo "  ✓ opencode/config.json — apiKey injected (idempotent)"
else
  # First install: create dir and copy from dotfiles, then inject
  install_file "${DOTFILES}/opencode/config.json" "$OC_DST"
  jq --arg key "$OPENCODE_KEY" \
    '.provider.opencode.options.apiKey = $key' \
    "$OC_DST" > "${OC_DST}.tmp" && mv "${OC_DST}.tmp" "$OC_DST"
  echo "  ✓ opencode/config.json — created with apiKey"
fi

# ── 3) Agy (Antigravity) global settings ──────────────────────────────
AGY_DST="${HOME}/.gemini/antigravity-cli/settings.json"
install_file "${DOTFILES}/agy/settings.json" "$AGY_DST"
# After copy, inject the two secrets into the env block
jq --arg gh "$GITHUB_TOKEN" --arg bt "$BRAINTRUST_KEY" \
  '.env.GITHUB_PERSONAL_ACCESS_TOKEN = $gh | .env.BRAINTRUST_API_KEY = $bt' \
  "$AGY_DST" > "${AGY_DST}.tmp" && mv "${AGY_DST}.tmp" "$AGY_DST"
echo "  ✓ agy/settings.json — env secrets injected"

# ── 4) Openclaw: LM Studio endpoint config ────────────────────────────
install_file "${DOTFILES}/openclaw/.env" "${HOME}/.openclaw/.env"

echo ""
echo "Done. Notes for new machine setup:"
echo "  1. Paths reference /home/patrick — update dotfiles/agy/settings.json if username differs."
echo "  2. codebase-memory-mcp install -y   (registers MCP in all harnesses)"
echo "  3. Secrets come from environments/.secrets/dev-tools.yaml (SSOT)."
echo "     After rotation, update ONLY that file, then re-run this script."
