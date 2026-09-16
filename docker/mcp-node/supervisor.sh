#!/bin/sh
# docker/mcp-node/supervisor.sh — Supervisor fuer die acht Node-MCP-Server
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
#
# [T900191] MCP_NODE_SERVICES waehlt die Dienste (kommagetrennt):
#   llm-proxy, postgres, github, ticket-mcp, brain-mcp, task-runner,
#   codebase-memory, bge-mcp
# Leer oder ungesetzt = alle. Secret-/Token-Pruefungen gelten zusaetzlich:
# ein ausgewaehlter Dienst ohne Pflichtwert startet trotzdem nicht.
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

SERVICES="$(printf '%s' "${MCP_NODE_SERVICES:-}" | tr -d ' ')"
KNOWN="llm-proxy postgres github ticket-mcp brain-mcp task-runner codebase-memory bge-mcp"
for s in $(printf '%s' "$SERVICES" | tr ',' ' '); do
  case " $KNOWN " in
    *" $s "*) ;;
    *) log "FEHLER: unbekannter Dienst '$s' in MCP_NODE_SERVICES (bekannt: $KNOWN)"; exit 2 ;;
  esac
done

# enabled <name> — 0, wenn der Dienst laut MCP_NODE_SERVICES starten soll.
enabled() {
  [ -z "$SERVICES" ] && return 0
  case ",$SERVICES," in
    *",$1,"*) return 0 ;;
  esac
  log "$1: nicht in MCP_NODE_SERVICES — Server nicht gestartet"
  return 1
}

[ -d "$REPO" ] || log "WARN: $REPO fehlt — repo-sync hat noch nicht synchronisiert"

# ── llm-proxy (18235) ────────────────────────────────────────────────
# LLM_PROXY_HOST_BIND ist der Cluster-Bind-Pfad aus listeners.mjs: mit
# gesetztem Override laeuft KEINE Docker-Bridge-Discovery, der Listener bindet
# direkt auf die Pod-IP. Ohne ihn lauschte der Proxy auf 127.0.0.1 und waere
# aus dem Mesh unerreichbar.
if enabled llm-proxy; then
  supervise llm-proxy env \
    LLM_PROXY_HOST_BIND="${LLM_PROXY_HOST_BIND:-0.0.0.0}" \
    LLM_PROXY_PORT="${LLM_PROXY_PORT:-18235}" \
    LOADOUTS_PATH="${LOADOUTS_PATH:-$REPO/scripts/llm/loadouts.json}" \
    node "$REPO/scripts/llm-proxy/server.mjs"
fi

# ── postgres (3001) ──────────────────────────────────────────────────
# [T900191] mcp-postgres-local statt supergateway + mcp-server-postgres: der
# Server prueft MCP_POSTGRES_TOKEN (requireToken) und laesst nur lesende
# Einzelabfragen zur DB durch. supergateway prueft kein Token. Kein Reaper mehr:
# die verwaisten mcp-server-postgres-Kinder (T002321) entstehen nur unter
# supergateway. Der Server bindet fest auf 127.0.0.1 — Zugriff ueber
# kubectl port-forward, nicht ueber die ClusterIP.
if enabled postgres; then
  if [ -z "${DATABASE_URL:-}" ]; then
    log "postgres: DATABASE_URL nicht gesetzt — Server nicht gestartet"
  elif [ -z "${MCP_POSTGRES_TOKEN:-}" ]; then
    log "postgres: MCP_POSTGRES_TOKEN nicht gesetzt — Server nicht gestartet"
  else
    supervise postgres env PORT=3001 node "$REPO/scripts/mcp-gateway/mcp-postgres-local.mjs"
  fi
fi

# ── github (3002) ────────────────────────────────────────────────────
if enabled github; then
  if [ -n "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
    gateway github 3002 "/usr/local/bin/github-mcp-server stdio"
  else
    log "github: GITHUB_PERSONAL_ACCESS_TOKEN nicht gesetzt — Server nicht gestartet"
  fi
fi

# ── Repo-eigene Server ───────────────────────────────────────────────
enabled ticket-mcp      && gateway ticket-mcp    3003 "node $REPO/scripts/ticket-mcp-node/server.mjs"
enabled brain-mcp       && gateway brain-mcp     3004 "node $REPO/scripts/brain-mcp-node/server.mjs"
enabled task-runner     && gateway task-runner   3005 "node $REPO/scripts/mcp-task-runner/server.mjs --taskfile $REPO/Taskfile.yml"
enabled codebase-memory && gateway codebase-memory 3006 "codebase-memory-mcp"

# ── bge-mcp (3007) ───────────────────────────────────────────────────
# [T900191] Service-Port 13005 -> 3007. Embedding und Rerank laufen ueber den
# llm-proxy im selben Pod. Ohne llm-proxy in der Auswahl antwortet bge-mcp mit
# Upstream-Fehlern. 0.0.0.0, damit der Service-targetPort einen Socket hat; der
# Host-Guard in scripts/lib/mcp-http-security.mjs laesst trotzdem nur
# Loopback-Host-Header durch (Port-Forward).
if enabled bge-mcp; then
  if [ -z "${BGE_MCP_TOKEN:-}" ]; then
    log "bge-mcp: BGE_MCP_TOKEN nicht gesetzt — Server nicht gestartet"
  else
    supervise bge-mcp env \
      BGE_MCP_HOST="${BGE_MCP_HOST:-0.0.0.0}" \
      BGE_MCP_PORT=3007 \
      LLM_EMBED_URL=http://127.0.0.1:18235 \
      LLM_RERANKER_URL=http://127.0.0.1:18235 \
      node "$REPO/scripts/bge-mcp/server.mjs"
  fi
fi

log "alle Server gestartet — warte"
wait
