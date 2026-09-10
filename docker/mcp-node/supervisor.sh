#!/bin/sh
# docker/mcp-node/supervisor.sh — Supervisor fuer die sieben Node-MCP-Server
# des dev-pod [T900107].
#
# Warum ein eigener Supervisor und nicht sieben Container: Container in einem
# Pod teilen den Network-Namespace und kosten kaum RAM, aber jede Deklaration
# kostet Requests. Der Monolith reservierte 960Mi fuer 341Mi realen Verbrauch.
# Sieben weitere Container haetten denselben Fehler multipliziert.
#
# Der Supervisor ist bewusst klein: starten, auf Exit warten, mit Backoff neu
# starten, bei SIGTERM alle Kinder beenden. Keine Paketinstallation — alles,
# was hier aufgerufen wird, liegt im Image (siehe Dockerfile).
#
# Repo-Pfad: /workspace/repo, read-only vom repo-sync-Sidecar befuellt. Die
# Server duerfen dort nicht schreiben; wer Schreibzugriff braucht, bekommt ihn
# unter /tmp.
set -u

REPO="${DEV_POD_REPO:-/workspace/repo}"
RESTART_DELAY="${MCP_SUPERVISOR_RESTART_DELAY:-5}"

log() { echo "[supervisor] $*"; }

PIDS=""

# Startet <name> mit <kommando…> und haelt es am Leben.
supervise() {
  name="$1"; shift
  (
    while true; do
      log "start $name"
      "$@"
      code=$?
      log "$name exited (code=$code) — restart in ${RESTART_DELAY}s"
      sleep "$RESTART_DELAY"
    done
  ) &
  PIDS="$PIDS $!"
}

# Haengt einen stdio-MCP-Server per supergateway an einen HTTP-Port.
# supergateway liegt im Image (npm install -g zur BAUZEIT, siehe Dockerfile).
gateway() {  # <name> <port> <stdio-kommando>
  name="$1"; port="$2"; stdio="$3"
  supervise "$name" supergateway \
    --stdio "$stdio" \
    --outputTransport streamableHttp \
    --stateless \
    --port "$port" \
    --streamableHttpPath /mcp \
    --healthEndpoint /health
}

shutdown() {
  log "SIGTERM — stopping children"
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null
  exit 0
}
trap shutdown TERM INT

[ -d "$REPO" ] || log "WARN: $REPO fehlt — repo-sync hat noch nicht synchronisiert"

# ── llm-proxy (18235) ────────────────────────────────────────────────
# LLM_PROXY_HOST_BIND ist der Cluster-Bind-Pfad aus listeners.mjs: mit
# gesetztem Override laeuft KEINE Docker-Bridge-Discovery, der Listener bindet
# direkt auf die Pod-IP. Ohne ihn lauschte der Proxy auf 127.0.0.1 und waere
# aus dem Mesh unerreichbar.
supervise llm-proxy env \
  LLM_PROXY_HOST_BIND="${LLM_PROXY_HOST_BIND:-0.0.0.0}" \
  LLM_PROXY_PORT="${LLM_PROXY_PORT:-18235}" \
  node "$REPO/scripts/llm-proxy/server.mjs"

# ── postgres (3001) ──────────────────────────────────────────────────
# Der Child-Reaper aus T002321/T002350 laeuft als eigener Hintergrundprozess
# neben dem Gateway; die Auswahl-Logik selbst liegt in einer eigenen Datei,
# damit die Guards sie laden koennen.
if [ -n "${DATABASE_URL:-}" ]; then
  supervise postgres-reaper /bin/sh /opt/mcp-node/reap-postgres-children.sh
  gateway postgres 3001 "mcp-server-postgres \"$DATABASE_URL\""
else
  log "postgres: DATABASE_URL nicht gesetzt — Server nicht gestartet"
fi

# ── github (3002) ────────────────────────────────────────────────────
if [ -n "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
  gateway github 3002 "/usr/local/bin/github-mcp-server stdio"
else
  log "github: GITHUB_PERSONAL_ACCESS_TOKEN nicht gesetzt — Server nicht gestartet"
fi

# ── Repo-eigene Server ───────────────────────────────────────────────
gateway ticket-mcp    3003 "node $REPO/scripts/ticket-mcp-node/server.mjs"
gateway brain-mcp     3004 "node $REPO/scripts/brain-mcp-node/server.mjs"
gateway task-runner   3005 "node $REPO/scripts/mcp-task-runner/server.mjs --taskfile $REPO/Taskfile.yml"
gateway codebase-memory 3006 "codebase-memory-mcp"

log "alle Server gestartet — warte"
wait
