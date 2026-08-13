#!/usr/bin/env bats
# tests/spec/openspec-pgvector/context-retrieve-fallback.bats
# SSOT: openspec/specs/openspec-pgvector.md
#
# Pruefmodus: command output verification (T002448-M4). Jeder Test RUFT
# scripts/context-retrieve.mjs auf und prueft dessen Ausgabe und Exit-Code —
# kein Grep auf Skript-Interna.
#
# Deterministisch (p6, T002658): Die Fallback-Faelle werden ueber provozierte
# Fehler ausgeloest (unerreichbares Embedding-Backend, Budget unter dem
# Pinned-Set) — nie ueber den Zustand der echten Umgebung. Nur der
# Null-Kandidaten-Fall braucht eine erreichbare Dev-DB und skip-t, wenn sie
# offline ist.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CLI="$REPO/scripts/context-retrieve.mjs"
  export LLM_EMBED_URL="${LLM_EMBED_URL:-http://127.0.0.1:8081}"
  export LLM_RERANKER_URL="${LLM_RERANKER_URL:-http://127.0.0.1:8093}"
}

# Gemeinsamer Warnsatz-Fragment, den jede unvollstaendige Antwort traegt
# (design.md). Als Fragment ohne Zeilenanker geprueft (T002716: Semantik
# statt Darstellung — der Wortlaut darf sich aendern, die Unvollstaendigkeits-
# Aussage nicht).
WARN_FRAGMENT='Schliesse aus fehlenden Informationen nicht auf deren Nichtexistenz'

@test "context-retrieve: unerreichbares Embedding -> exit 0, mode=rulefilter, Warnsatz" {
  # Provozierter Fehler statt echter Umgebungszustand: Port 1 lauscht nichts.
  LLM_EMBED_URL="http://127.0.0.1:1" \
    run node "$CLI" --task-prompt "beliebige Aufgabe" --role bachelorprojekt-db
  [ "$status" -eq 0 ]
  # CLI-Output in einer lokalen Variablen festhalten: `run` ueberschreibt
  # $output bei jedem Aufruf, die folgenden Proben muessen denselben Text sehen.
  local cli_out="$output"

  # Positiv-Anker (T002356-M1): der Fallback-Block muss zustande kommen.
  run bash -c "printf '%s' \"\$1\" | grep '^<!-- context-retrieve' | grep -c 'mode=rulefilter'" _ "$cli_out"
  [ "$output" -ge 1 ]

  run bash -c "printf '%s' \"\$1\" | grep -F -c '$WARN_FRAGMENT'" _ "$cli_out"
  [ "$output" -ge 1 ]
}

@test "context-retrieve: --budget 0 -> mode=truncated, Guardrails trotzdem im Block" {
  # Budget unter dem Pinned-Set: kein Backend-Aufruf, Pinned-Kontext vollstaendig.
  run node "$CLI" --task-prompt "beliebige Aufgabe" --role bachelorprojekt-db --budget 0
  [ "$status" -eq 0 ]
  local cli_out="$output"

  # Positiv-Anker (T002356-M1): der Pinned-Kontext erscheint trotz Budget 0.
  run bash -c "printf '%s' \"\$1\" | grep -F -c 'Pinned-Kontext (Rolle: bachelorprojekt-db)'" _ "$cli_out"
  [ "$output" -ge 1 ]

  run bash -c "printf '%s' \"\$1\" | grep '^<!-- context-retrieve' | grep -c 'mode=truncated'" _ "$cli_out"
  [ "$output" -ge 1 ]
}

@test "context-retrieve: keine Kandidaten -> nicht-leerer Block mit Warnsatz" {
  # Braucht eine erreichbare Embedding- und Dev-DB; eine Korpus-Whitelist, die
  # nichts matcht, erzwingt deterministisch 0 Kandidaten — aber erst, wenn die
  # Kette davor durchlaeuft (skip statt Umgebungsannahme).
  if ! curl -sf -m 10 -X POST "$LLM_EMBED_URL/v1/embeddings" \
    -H 'Content-Type: application/json' -d '{"model":"bge-m3","input":["ping"]}' >/dev/null 2>&1; then
    skip "Embed-Endpoint nicht erreichbar (offline/CI)"
  fi
  local pw
  pw="$(kubectl --context k3d-mentolder-dev -n workspace get secret workspace-secrets \
    -o jsonpath='{.data.SHARED_DB_PASSWORD}' 2>/dev/null | base64 -d 2>/dev/null || true)"
  if [[ -z "$pw" ]]; then
    skip "workspace-secrets not readable (offline/CI)"
  fi
  local cli_out
  cli_out="$(PGURL="postgres://website:${pw}@localhost:5432/website" \
    timeout 120 node "$CLI" --task-prompt "beliebige Aufgabe" --role bachelorprojekt-db \
    --corpora "kein-solcher-korpus" 2>&1)"
  local status=$?
  [ "$status" -eq 0 ]
  [ -n "$cli_out" ]

  # Positiv-Anker: der Block existiert und traegt die Herkunfts-Marker.
  run bash -c "printf '%s' \"\$1\" | grep '^<!-- context-retrieve' | grep -c 'candidates=0'" _ "$cli_out"
  [ "$output" -ge 1 ]

  run bash -c "printf '%s' \"\$1\" | grep -F -c '$WARN_FRAGMENT'" _ "$cli_out"
  [ "$output" -ge 1 ]
}
