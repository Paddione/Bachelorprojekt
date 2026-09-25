#!/usr/bin/env bash
# scripts/glimmer-worker-mcp/install.sh — Glimmer-Worker-MCP installieren und in Muse Code eintragen [T900373].
#
# Nutzung:
#   bash scripts/glimmer-worker-mcp/install.sh                # Token, Unit, Start, Registrierung
#   bash scripts/glimmer-worker-mcp/install.sh --register-only # nur settings.json-Eintraege
#
# Registriert mcpServers.glimmer-worker in
#   - ~/.config/muse/settings.json                    (Muse Code in WSL)
#   - %USERPROFILE%\.config\muse\settings.json        (Muse Code auf Windows, via cmd.exe/wslpath)
# Override der Zieldateien: GLIMMER_WORKER_MUSE_SETTINGS="<datei> <datei> ..."
# Bewusst NICHT in docs/agent-guide/registry/mcp.yaml (Rekursion ueber opencode, Design D7).
# Das Token wird nie ausgegeben.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${GLIMMER_WORKER_ENV_FILE:-$HOME/.config/glimmer-worker-mcp/server.env}"
PORT="${GLIMMER_WORKER_MCP_PORT:-13007}"
URL="http://127.0.0.1:${PORT}/mcp"
UNIT_SRC="$REPO/scripts/glimmer-worker-mcp/glimmer-worker-mcp.service"
REGISTER_ONLY=0
[ "${1:-}" = "--register-only" ] && REGISTER_ONLY=1

command -v jq >/dev/null || { echo "install.sh: jq fehlt" >&2; exit 2; }

ensure_token() {
  if [ ! -s "$ENV_FILE" ]; then
    mkdir -p "$(dirname "$ENV_FILE")"
    ( umask 077; printf 'GLIMMER_WORKER_MCP_TOKEN=%s\n' "$(openssl rand -hex 32)" > "$ENV_FILE" )
    echo "Token erzeugt: $ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
}

read_token() {
  sed -n 's/^GLIMMER_WORKER_MCP_TOKEN=//p' "$ENV_FILE" | head -1
}

install_unit() {
  local dst="$HOME/.config/systemd/user/glimmer-worker-mcp.service"
  mkdir -p "$(dirname "$dst")"
  ln -sf "$UNIT_SRC" "$dst"
  systemctl --user daemon-reload
  systemctl --user enable --now glimmer-worker-mcp >/dev/null 2>&1
  systemctl --user restart glimmer-worker-mcp
  for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null && { echo "Server laeuft auf 127.0.0.1:${PORT}"; return 0; }
    sleep 0.5
  done
  echo "install.sh: Server antwortet nicht — journalctl --user -u glimmer-worker-mcp" >&2
  return 1
}

default_targets() {
  echo "$HOME/.config/muse/settings.json"
  if command -v cmd.exe >/dev/null 2>&1 && command -v wslpath >/dev/null 2>&1; then
    local winprofile
    winprofile="$(cd /mnt/c 2>/dev/null && cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r')"
    [ -n "$winprofile" ] && echo "$(wslpath -u "$winprofile")/.config/muse/settings.json"
  fi
}

register() {
  local file="$1" tok="$2" tmp
  mkdir -p "$(dirname "$file")"
  [ -s "$file" ] || echo '{"schema_version":1}' > "$file"
  cp "$file" "$file.bak"
  tmp="$(mktemp)"
  jq --arg url "$URL" --arg tok "$tok" \
    '.mcpServers = ((.mcpServers // {}) + {"glimmer-worker": {type: "http", url: $url, headers: {Authorization: ("Bearer " + $tok)}}})' \
    "$file" > "$tmp"
  cat "$tmp" > "$file"   # Inhalt ersetzen, Rechte/Symlinks der Zieldatei behalten
  rm -f "$tmp"
  echo "registriert: $file (Backup: $file.bak)"
}

if [ "$REGISTER_ONLY" -eq 0 ]; then
  ensure_token
  install_unit
fi
[ -s "$ENV_FILE" ] || { echo "install.sh: $ENV_FILE fehlt — erst ohne --register-only ausfuehren" >&2; exit 2; }
TOKEN="$(read_token)"
[ -n "$TOKEN" ] || { echo "install.sh: kein GLIMMER_WORKER_MCP_TOKEN in $ENV_FILE" >&2; exit 2; }

if [ -n "${GLIMMER_WORKER_MUSE_SETTINGS:-}" ]; then
  read -r -a TARGETS <<<"$GLIMMER_WORKER_MUSE_SETTINGS"
else
  mapfile -t TARGETS < <(default_targets)
fi
for f in "${TARGETS[@]}"; do register "$f" "$TOKEN"; done

if [ "$REGISTER_ONLY" -eq 0 ]; then
  n="$(curl -s "$URL" -H 'content-type: application/json' -H "Authorization: Bearer $TOKEN" \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length')"
  echo "Smoke-Test tools/list: ${n} Tools"
  echo "In Muse pruefen: muse exec \"Rufe glimmer_worker_status auf und gib das Ergebnis aus.\""
fi
