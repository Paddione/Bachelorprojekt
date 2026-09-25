#!/usr/bin/env bash
# scripts/comfy-image-mcp/install.sh — Bild-MCP installieren und in Muse Code eintragen [T900379].
#
# Nutzung:
#   bash scripts/comfy-image-mcp/install.sh                 # pip-Deps, Token, Units, Start, Registrierung
#   bash scripts/comfy-image-mcp/install.sh --register-only # nur settings.json-Eintraege
#
# Registriert mcpServers.comfy-image in
#   - ~/.config/muse/settings.json                    (Muse Code in WSL)
#   - %USERPROFILE%\.config\muse\settings.json        (Muse Code auf Windows, via cmd.exe/wslpath)
# Override der Zieldateien: COMFY_IMAGE_MUSE_SETTINGS="<datei> <datei> ..."
# Bewusst NICHT in docs/agent-guide/registry/mcp.yaml (Scope: nur Muse Code, Design D7).
# comfyui.service wird installiert, aber NICHT aktiviert — der MCP-Server startet es bei Bedarf.
# Das Token wird nie ausgegeben.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$REPO/scripts/comfy-image-mcp"
ENV_FILE="${COMFY_IMAGE_ENV_FILE:-$HOME/.config/comfy-image-mcp/server.env}"
PORT="${COMFY_IMAGE_MCP_PORT:-13008}"
URL="http://127.0.0.1:${PORT}/mcp"
PY="${COMFY_IMAGE_PYTHON:-$HOME/ComfyUI/.venv/bin/python}"
UNIT_DIR="$HOME/.config/systemd/user"
REGISTER_ONLY=0
[ "${1:-}" = "--register-only" ] && REGISTER_ONLY=1

command -v jq >/dev/null || { echo "install.sh: jq fehlt" >&2; exit 2; }

install_python_deps() {
  [ -x "$PY" ] || { echo "install.sh: ComfyUI-Python fehlt: $PY (COMFY_IMAGE_PYTHON setzen)" >&2; return 1; }
  echo "installiere rembg onnxruntime in $PY ..."
  # Das ComfyUI-venv ist mit uv angelegt und hat kein pip; pip nur als Fallback.
  if command -v uv >/dev/null 2>&1; then
    uv pip install --quiet --python "$PY" rembg onnxruntime
  else
    "$PY" -m pip install --quiet rembg onnxruntime
  fi
  # Modell einmal laden, damit der erste Job nicht ~180 MB herunterlaedt.
  "$PY" -c 'from rembg import new_session; new_session("isnet-general-use")'
  echo "rembg bereit (isnet-general-use)"
}

ensure_token() {
  if [ ! -s "$ENV_FILE" ]; then
    mkdir -p "$(dirname "$ENV_FILE")"
    ( umask 077; printf 'COMFY_IMAGE_MCP_TOKEN=%s\n' "$(openssl rand -hex 32)" > "$ENV_FILE" )
    echo "Token erzeugt: $ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
}

read_token() {
  sed -n 's/^COMFY_IMAGE_MCP_TOKEN=//p' "$ENV_FILE" | head -1
}

install_units() {
  mkdir -p "$UNIT_DIR"
  # Units RENDERN und kopieren statt verlinken (T900376): ExecStart zeigt auf genau das Repo,
  # aus dem der Installer laeuft. Nach einem Repo-Umzug: Installer erneut ausfuehren.
  rm -f "$UNIT_DIR/comfy-image-mcp.service" "$UNIT_DIR/comfyui.service"
  sed "s|%h/Bachelorprojekt/scripts/comfy-image-mcp/server.mjs|$DIR/server.mjs|" \
    "$DIR/comfy-image-mcp.service" > "$UNIT_DIR/comfy-image-mcp.service"
  grep -qF "$DIR/server.mjs" "$UNIT_DIR/comfy-image-mcp.service" \
    || { echo "install.sh: ExecStart nicht auf $DIR gesetzt" >&2; return 1; }
  cp "$DIR/comfyui.service" "$UNIT_DIR/comfyui.service"
  systemctl --user daemon-reload
  if ! out="$(systemctl --user enable --now comfy-image-mcp 2>&1)"; then
    echo "install.sh: systemctl --user enable --now comfy-image-mcp fehlgeschlagen:" >&2
    echo "$out" >&2
    return 1
  fi
  systemctl --user restart comfy-image-mcp
  for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null && { echo "Server laeuft auf 127.0.0.1:${PORT}"; return 0; }
    sleep 0.5
  done
  echo "install.sh: Server antwortet nicht — journalctl --user -u comfy-image-mcp" >&2
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
    '.mcpServers = ((.mcpServers // {}) + {"comfy-image": {type: "http", url: $url, headers: {Authorization: ("Bearer " + $tok)}}})' \
    "$file" > "$tmp"
  cat "$tmp" > "$file"   # Inhalt ersetzen, Rechte/Symlinks der Zieldatei behalten
  rm -f "$tmp"
  echo "registriert: $file (Backup: $file.bak)"
}

if [ "$REGISTER_ONLY" -eq 0 ]; then
  install_python_deps
  ensure_token
  install_units
fi
[ -s "$ENV_FILE" ] || { echo "install.sh: $ENV_FILE fehlt — erst ohne --register-only ausfuehren" >&2; exit 2; }
TOKEN="$(read_token)"
[ -n "$TOKEN" ] || { echo "install.sh: kein COMFY_IMAGE_MCP_TOKEN in $ENV_FILE" >&2; exit 2; }

if [ -n "${COMFY_IMAGE_MUSE_SETTINGS:-}" ]; then
  read -r -a TARGETS <<<"$COMFY_IMAGE_MUSE_SETTINGS"
else
  mapfile -t TARGETS < <(default_targets)
fi
for f in "${TARGETS[@]}"; do register "$f" "$TOKEN"; done

if [ "$REGISTER_ONLY" -eq 0 ]; then
  n="$(curl -s "$URL" -H 'content-type: application/json' -H "Authorization: Bearer $TOKEN" \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length')"
  echo "Smoke-Test tools/list: ${n} Tools"
  echo "In Muse pruefen: muse exec \"Rufe image_status auf und gib das Ergebnis aus.\""
fi
