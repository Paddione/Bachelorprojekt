#!/usr/bin/env bats
# tests/spec/openspec-pgvector/context-retrieve-cli.bats
# SSOT: openspec/specs/openspec-pgvector.md
#
# Pruefmodus: command output verification (T002448-M4). Der Test RUFT
# scripts/context-retrieve.mjs auf und prueft dessen Ausgabe (--json) und
# Exit-Code — er greppt nicht den Quelltext des Skripts.
#
# Live-Umgebungs-Opt-in (dasselbe Muster wie _skip_if_no_db in
# tests/spec/software-factory/): Embed/Rerank-Endpoint und Dev-DB muessen
# erreichbar sein, sonst skip (offline/CI). Die Fallback-Faelle testet
# context-retrieve-fallback.bats deterministisch ueber provozierte Fehler.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CLI="$REPO/scripts/context-retrieve.mjs"
  # Endpoint-Konvention aus website/src/lib/bge-router.ts: LLM_EMBED_URL /
  # LLM_RERANKER_URL. Lokale Port-Forwards (bge-MCP-Units) — nur gesetzt,
  # wenn die Umgebung sie nicht schon mitbringt.
  export LLM_EMBED_URL="${LLM_EMBED_URL:-http://127.0.0.1:8081}"
  export LLM_RERANKER_URL="${LLM_RERANKER_URL:-http://127.0.0.1:8093}"
}

# Probiert die bge-Endpoints mit einer echten Anfrage an — eine tatsaechliche
# Antwort entscheidet, nicht Prozess- oder Unit-Zustand (p4-Timeout-Konvention).
_embed_ready() {
  curl -sf -m 10 -X POST "$LLM_EMBED_URL/v1/embeddings" \
    -H 'Content-Type: application/json' \
    -d '{"model":"bge-m3","input":["ping"]}' >/dev/null 2>&1
}

_rerank_ready() {
  curl -sf -m 15 -X POST "$LLM_RERANKER_URL/v1/rerank" \
    -H 'Content-Type: application/json' \
    -d '{"query":"ping","documents":["a","b"]}' >/dev/null 2>&1
}

# PGURL wie psql_tickets aus dem k3d-Secret ableiten; 5432 ist das
# pgvector-Port-Forward auf die k3d shared-db.
_export_pgurl() {
  local pw
  pw="$(kubectl --context k3d-mentolder-dev -n workspace get secret workspace-secrets \
    -o jsonpath='{.data.SHARED_DB_PASSWORD}' 2>/dev/null | base64 -d 2>/dev/null || true)"
  if [[ -z "$pw" ]]; then
    skip "workspace-secrets not readable (offline/CI)"
  fi
  export PGURL="postgres://website:${pw}@localhost:5432/website"
}

# ── S1: Retrieval-CLI (T002658) ──────────────────────────────────────

@test "context-retrieve: --json liefert genau einen Embed- und hoechstens einen Rerank-Aufruf" {
  _embed_ready || skip "Embed-Endpoint nicht erreichbar (offline/CI)"
  _rerank_ready || skip "Rerank-Endpoint nicht erreichbar (offline/CI)"
  _export_pgurl

  # CLI-Output in einer Variablen festhalten — `run` wuerde $output bei jeder
  # weiteren Zuweisung ueberschreiben (BATS-Falle, siehe jq-Ausfuehrungen unten).
  run node "$CLI" --task-prompt "Sealed-Secrets fuer die Fleet-Kluster verwalten und rotieren" \
    --role bachelorprojekt-infra --json
  [ "$status" -eq 0 ]
  local cli_json="$output"

  # Positiv-Anker zuerst (T002356-M1): der Erfolgsfall muss durchlaufen.
  run jq -r '.mode' <<<"$cli_json"
  [ "$output" = "retrieval" ]

  run jq -r '.backendCalls.embed' <<<"$cli_json"
  [ "$output" = "1" ]

  # Negativ-Aussage: der Rerank darf nicht mehrfach laufen (ein Batch ueber
  # alle Kandidaten statt einer Schleife) — nur gedeutet, nachdem der
  # Erfolgsfall oben gruen war.
  local rerank_calls
  rerank_calls="$(jq -r '.backendCalls.rerank' <<<"$cli_json")"
  [ "$rerank_calls" -le 1 ]
}

# ── p1: HNSW-Index (T002658) ─────────────────────────────────────────

@test "pg_indexes liefert chunks_embedding_hnsw fuer knowledge.chunks" {
  local pod
  pod="$(kubectl --context k3d-mentolder-dev -n workspace get pod \
    -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1)" || true
  if [[ -z "$pod" ]]; then
    skip "no Running shared-db pod reachable (offline/CI)"
  fi

  run kubectl --context k3d-mentolder-dev -n workspace exec "$pod" -c postgres -- \
    psql -U website -d website -t -A -c \
    "SELECT indexname FROM pg_indexes WHERE schemaname='knowledge' AND tablename='chunks' AND indexname='chunks_embedding_hnsw'"
  [ "$status" -eq 0 ]
  [ "$output" = "chunks_embedding_hnsw" ]
}
