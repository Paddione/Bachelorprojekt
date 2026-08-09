#!/usr/bin/env bash
# scripts/openspec-embed-local.sh — fail-visible wrapper around openspec-embed.mjs
# for dev-flow-plan / opencode-flow-plan (Hybrid-Kontext-Transfer Teil 2).
#
# Problem: openspec-embed.mjs ist best-effort und skippt STILL, wenn
# SESSIONS_DATABASE_URL fehlt oder das TEI-Embedding-Backend down ist — der
# pgvector-Index (knowledge.chunks) bleibt dann leer und factory-mcp
# `openspec_find_similar` findet den Change nicht (T002081/T002082-Vorfall).
#
# Dieser Wrapper macht den Schritt verlässlich:
#   1. SESSIONS_DATABASE_URL: falls nicht gesetzt, per kubectl aus dem
#      Website-Deployment gelesen (Literal-Env) und über einen temporären
#      port-forward auf die Fleet-shared-db umgeschrieben. Die URL enthält
#      Credentials und wird NIE ausgegeben.
#   2. LLM_EMBED_URL: Default http://127.0.0.1:8081 — der kubectl port-forward
#      auf svc/llm-gateway-embed, den der bge-mcp systemd-User-Service
#      (scripts/bge-mcp/bge-mcp.service) seit T002551 dauerhaft hält. Vorab-
#      Probe; bei totem Backend klare Remediation statt Silent-Skip.
#   3. Ausgabe von openspec-embed.mjs wird geprüft: nur "indexed slug=" ist
#      Erfolg (Exit 0). "skipping"/"failure" => Exit 1 mit Hinweis.
#
# Usage: bash scripts/openspec-embed-local.sh <slug> [<repo-root-mit-change>]
#   <repo-root-mit-change>: optionaler Worktree-Pfad (OPENSPEC_EMBED_REPO),
#   Default: Repo-Root dieses Checkouts.
set -euo pipefail

SLUG="${1:?usage: openspec-embed-local.sh <slug> [repo-root]}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
EMBED_REPO="${2:-$REPO_ROOT}"
# BLEIBT fleet [T002626]: dieses Skript schreibt nach knowledge.chunks
# (pgvector), nicht ins tickets-Schema. `knowledge` ist in ADR-006 ausdruecklich
# als "bewusst nicht verlagert" gefuehrt — es haengt an der Website-Suche und am
# produktiven pgvector-Raum. Wer hier auf lokal umstellt, schreibt Embeddings in
# einen Index, den niemand liest.
CTX="${FACTORY_CTX:-fleet}"

source "$HERE/openspec-embed-lib.sh"

PF_PID=""
cleanup() { [[ -n "$PF_PID" ]] && kill "$PF_PID" 2>/dev/null || true; }
trap cleanup EXIT

# --- 1. Embedding-Backend proben (fail-fast, bevor wir die DB anfassen) -----
probe_embed() {
  curl -s --max-time "${OPENSPEC_EMBED_PROBE_TIMEOUT:-20}" -o /dev/null -w '%{http_code}' \
    -X POST "$1/v1/embeddings" -H 'Content-Type: application/json' \
    -d '{"input":["ping"],"model":"bge-m3"}' 2>/dev/null || echo 000
}
EMBED_URL="${LLM_EMBED_URL:-http://127.0.0.1:8081}"
if [[ "$(probe_embed "$EMBED_URL")" != "200" ]]; then
  cat >&2 <<'EOF'
[openspec-embed-local] FEHLER: kein Embedding-Backend erreichbar (:8081).
Remediation (seit T002551 läuft bge-embed als Cluster-CPU-Deployment):
  Der bge-mcp systemd-User-Service hält den port-forward auf 127.0.0.1:8081:
    systemctl --user status bge-mcp
    systemctl --user restart bge-mcp
  Manuell (Cluster-DNS ist auf dem WSL-Host nicht auflösbar, T002488):
    kubectl --context fleet port-forward -n workspace svc/llm-gateway-embed 8081:8081 &
  Prüfe dann: curl -s http://127.0.0.1:8081/v1/embeddings -H 'Content-Type: application/json' -d '{"model":"bge-m3","input":["test"]}'
EOF
    exit 1
fi

# --- 2. DB-URL beschaffen (nie ausgeben!) -----------------------------------
DB_URL="${SESSIONS_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  RAW_URL="$(kubectl --context "$CTX" -n website get deploy website \
    -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="SESSIONS_DATABASE_URL")].value}' 2>/dev/null || true)"
  if [[ -z "$RAW_URL" ]]; then
    echo "[openspec-embed-local] FEHLER: SESSIONS_DATABASE_URL nicht gesetzt und nicht aus dem Cluster (--context $CTX) auflösbar." >&2
    exit 1
  fi
  PF_PORT="${OPENSPEC_EMBED_PF_PORT:-15432}"
  kubectl --context "$CTX" -n workspace port-forward svc/shared-db "${PF_PORT}:5432" >/dev/null 2>&1 &
  PF_PID=$!
  FOUND=0
  for _ in $(seq 1 10); do
    LISTENER_PID="$(pf_listener_pid "$PF_PORT")"
    if [[ -n "$LISTENER_PID" ]]; then
      if [[ "$LISTENER_PID" == "$PF_PID" ]]; then
        FOUND=1
        break
      fi
      FOREIGN_CMD="$(ps -p "$LISTENER_PID" -o cmd= 2>/dev/null || echo unbekannt)"
      echo "[openspec-embed-local] FEHLER: Port ${PF_PORT} wird von einem fremden Prozess (PID ${LISTENER_PID}: ${FOREIGN_CMD}) belegt, nicht vom eigenen Port-Forward (PID ${PF_PID}). Beende den fremden Prozess oder setze OPENSPEC_EMBED_PF_PORT auf einen freien Port." >&2
      exit 1
    fi
    sleep 1
  done
  if [[ "$FOUND" -ne 1 ]]; then
    echo "[openspec-embed-local] FEHLER: eigener Port-Forward (PID ${PF_PID}) hat Port ${PF_PORT} nicht innerhalb von 10s gebunden." >&2
    exit 1
  fi
  DB_URL="$(printf '%s' "$RAW_URL" | sed -E "s#@[^/]+/#@127.0.0.1:${PF_PORT}/#")"
fi

# --- 3. Embed + fail-visible Auswertung -------------------------------------
OUT="$(SESSIONS_DATABASE_URL="$DB_URL" LLM_EMBED_URL="$EMBED_URL" LLM_ENABLED=true \
  OPENSPEC_EMBED_REPO="$EMBED_REPO" \
  node "$REPO_ROOT/scripts/openspec-embed.mjs" --slug "$SLUG" 2>&1 || true)"
# Credentials-sicher loggen (URLs rausfiltern)
printf '%s\n' "$OUT" | grep -v '://' >&2 || true

if embed_output_is_success "$OUT"; then
  # Gesamtlage nach erfolgreichem Embedding zeigen
  COUNT_OUT="$(SESSIONS_DATABASE_URL="$DB_URL" LLM_EMBED_URL="$EMBED_URL" LLM_ENABLED=true \
    OPENSPEC_EMBED_REPO="$EMBED_REPO" \
    node "$REPO_ROOT/scripts/openspec-embed.mjs" --count-skipped 2>&1 || true)"
  printf '%s\n' "$COUNT_OUT" | grep -v '://' >&2 || true
  exit 0
fi
echo "[openspec-embed-local] FEHLER: Embedding wurde NICHT indiziert (Output oben) — nicht still weitermachen." >&2
exit 1
