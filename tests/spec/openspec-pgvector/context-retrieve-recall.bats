#!/usr/bin/env bats
# tests/spec/openspec-pgvector/context-retrieve-recall.bats
# SSOT: openspec/specs/openspec-pgvector.md
#
# Pruefmodus: command output verification (T002448-M4). Der Test RUFT
# scripts/context-retrieve.mjs mit --json auf und prueft die Ergebnisliste
# (jq-Probe auf .results) — kein Grep auf Skript-Interna.
#
# Recall gegen das Golden-Set (p6 Schritt 3, T002658):
#   tests/fixtures/context-retrieve/golden-queries.json traegt reale
#   Aufgabentexte mit je einem Chunk, der im Ergebnis erscheinen MUSS.
#   Die Fixture referenziert Chunks ueber STABILE Merkmale — Slug plus
#   Abschnittstitel — statt ueber Chunk-UUIDs (die bei jedem Backfill
#   wechseln). Verlangt wird nur Enthalten-sein, nicht Rang 1: die Schicht
#   liefert einen budgetierten Kontextblock, keine Rangliste fuer den
#   Menschen.
#
# Live-Umgebungs-Opt-in (Muster wie context-retrieve-cli.bats): Embed- und
# Rerank-Endpoint sowie die Dev-DB muessen erreichbar sein, sonst skip
# (offline/CI). Der Struktur-Test (Fixture-Groesse) laeuft immer.
#
# Ein @test ueber alle Eintraege statt eines @test pro Eintrag: bats-core
# liest Test-NAMEN zur Parse-Zeit und interpoliert Schleifenvariablen dort
# nicht (alle generierten Tests hiessen identisch -> Duplicate-name-Fehler).
# Der Koerper iteriert stattdessen ueber die Fixture; die Fehlermeldung
# nennt Index und Ziel-Slug des ersten Fehltreffers.

GOLDEN="$BATS_TEST_DIRNAME/../../fixtures/context-retrieve/golden-queries.json"

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CLI="$REPO/scripts/context-retrieve.mjs"
  export LLM_EMBED_URL="${LLM_EMBED_URL:-http://127.0.0.1:8081}"
  export LLM_RERANKER_URL="${LLM_RERANKER_URL:-http://127.0.0.1:8093}"
}

_embed_ready() {
  curl -sf -m 10 -X POST "$LLM_EMBED_URL/v1/embeddings" \
    -H 'Content-Type: application/json' \
    -d '{"model":"bge-m3","input":["ping"]}' >/dev/null 2>&1
}

_export_pgurl() {
  local pw
  pw="$(kubectl --context k3d-mentolder-dev -n workspace get secret workspace-secrets \
    -o jsonpath='{.data.SHARED_DB_PASSWORD}' 2>/dev/null | base64 -d 2>/dev/null || true)"
  if [[ -z "$pw" ]]; then
    skip "workspace-secrets not readable (offline/CI)"
  fi
  export PGURL="postgres://website:${pw}@localhost:5432/website"
}

# Struktureller Anker (laeuft immer, auch ohne Live-Umgebung): die Fixture
# muss existieren und mindestens zehn Eintraege tragen (p6-Vorgabe). Fehlt
# die Datei, waere der Recall-Lauf unten still leer — dieser Test macht den
# Fehlschlag sichtbar statt zu schweigen.
@test "context-retrieve recall: golden set enthaelt mindestens 10 Eintraege" {
  [[ -f "$GOLDEN" ]] || { echo "Fixture fehlt: $GOLDEN" >&2; return 1; }
  run jq 'length' "$GOLDEN"
  [ "$status" -eq 0 ]
  [ "$output" -ge 10 ]
}

@test "context-retrieve recall: alle Golden-Queries treffen ihren Ziel-Chunk" {
  [[ -f "$GOLDEN" ]] || { echo "Fixture fehlt: $GOLDEN" >&2; return 1; }
  _embed_ready || skip "Embed-Endpoint nicht erreichbar (offline/CI)"
  _export_pgurl

  local count idx task slug section
  count="$(jq 'length' "$GOLDEN")"
  for ((idx = 0; idx < count; idx++)); do
    task="$(jq -r ".[$idx].task" "$GOLDEN")"
    slug="$(jq -r ".[$idx].expect.slug" "$GOLDEN")"
    section="$(jq -r ".[$idx].expect.sectionTitle" "$GOLDEN")"

    # CLI-Output in einer lokalen Variablen festhalten: `run` ueberschreibt
    # $output bei jedem Aufruf, die jq-Probe muss denselben Text sehen.
    run node "$CLI" --task-prompt "$task" --role bachelorprojekt-infra --json
    [ "$status" -eq 0 ] || { echo "CLI-Fehler bei Query #$idx ($slug)" >&2; return 1; }
    local cli_json="$output"

    # Positiv-Anker (T002356-M1): die Zusicherung ist rein positiv — der
    # Ziel-Chunk MUSS im Ergebnis stehen, und zwar in der vollen Kette
    # (mode=retrieval, kein Fallback-Modus). Enthalten-sein genuegt, Rang 1
    # wird nicht verlangt.
    if ! jq -e --arg slug "$slug" --arg st "$section" \
      '.mode == "retrieval" and (.results | any(.slug == $slug and .sectionTitle == $st))' \
      <<<"$cli_json" >/dev/null 2>&1; then
      echo "Ziel-Chunk nicht im Ergebnis: Query #$idx, slug=$slug section=$section" >&2
      echo "mode=$(jq -r '.mode' <<<"$cli_json") deg=$(jq -r '.degraded' <<<"$cli_json")" >&2
      jq -r '.results[] | .slug + " | " + .sectionTitle' <<<"$cli_json" >&2
      return 1
    fi
  done
}
