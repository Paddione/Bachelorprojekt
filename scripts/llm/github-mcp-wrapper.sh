#!/usr/bin/env bash
# scripts/llm/github-mcp-wrapper.sh
#
# Startet den offiziellen GitHub-MCP-Server (github/github-mcp-server) als
# stdio-Kindprozess der Bruecke (scripts/llm-proxy/mcp-bridge.mjs), erreichbar
# unter http://127.0.0.1:18235/mcp/github-mcp.
#
# Warum ein Wrapper und kein direkter command-Eintrag in mcp-bridge.json:
#
#   1. TOKEN: Der Server braucht GITHUB_PERSONAL_ACCESS_TOKEN. Statt den Wert in
#      eine Datei zu schreiben, holt der Wrapper ihn zur LAUFZEIT aus dem
#      gh-CLI-Keyring. Damit liegt das Credential weder getrackt noch ungetrackt
#      auf Platte — es existiert nur in der Umgebung dieses Prozesses.
#
#   2. PATH: Die llm-proxy-Unit setzt PATH=/usr/local/bin:/usr/bin:/bin.
#      ~/.local/bin ist NICHT enthalten, das Binary dort waere fuer den
#      Kindprozess unauffindbar. Deshalb der absolute Pfad unten.
#      (gh liegt unter /usr/bin/gh und waere auffindbar, wird der Symmetrie und
#      der Robustheit gegen PATH-Aenderungen halber aber ebenso absolut genannt.)
#
# Installation des Servers (Release v1.8.0, SHA256 gegen checksums.txt geprueft):
#   curl -fL -o gh-mcp.tar.gz \
#     https://github.com/github/github-mcp-server/releases/download/v1.8.0/github-mcp-server_Linux_x86_64.tar.gz
#   tar -xzf gh-mcp.tar.gz github-mcp-server
#   install -m 0755 github-mcp-server ~/.local/bin/github-mcp-server
#
# Argumente dieses Wrappers werden an `github-mcp-server stdio` durchgereicht,
# etwa --read-only oder --toolsets=repos,issues. Aktuell laeuft er bewusst ohne
# Einschraenkung (voller Toolset, 44 Tools) — Betreiber-Entscheidung T002547.
set -euo pipefail

GH_BIN="${GH_BIN:-/usr/bin/gh}"
MCP_BIN="${GITHUB_MCP_BIN:-$HOME/.local/bin/github-mcp-server}"

if [[ ! -x "$MCP_BIN" ]]; then
  echo "github-mcp-wrapper: $MCP_BIN fehlt oder ist nicht ausfuehrbar." >&2
  echo "  Installation siehe Kopfkommentar dieser Datei." >&2
  exit 127
fi

if [[ ! -x "$GH_BIN" ]]; then
  echo "github-mcp-wrapper: $GH_BIN fehlt — ohne gh-CLI gibt es keinen Token." >&2
  exit 127
fi

# Fail-closed: ein leerer Token wuerde den Server starten lassen und erst beim
# ersten API-Aufruf scheitern. Die Bruecke expandiert {env:VAR} ihrerseits mit
# `|| ''` (mcp-bridge.mjs), still-leere Credentials sind hier also eine reale
# Fehlerklasse — nicht bloss Theorie.
if ! TOKEN="$("$GH_BIN" auth token 2>/dev/null)" || [[ -z "$TOKEN" ]]; then
  echo "github-mcp-wrapper: 'gh auth token' lieferte nichts." >&2
  echo "  Anmelden mit: gh auth login" >&2
  exit 1
fi

export GITHUB_PERSONAL_ACCESS_TOKEN="$TOKEN"
unset TOKEN

exec "$MCP_BIN" stdio "$@"
