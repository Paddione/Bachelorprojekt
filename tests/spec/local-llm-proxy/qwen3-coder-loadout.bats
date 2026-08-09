#!/usr/bin/env bats
# T002645 — Das qwen3-coder-Loadout und seine Proxy-Registrierung muessen denselben
# Port nennen.
#
# PRUEFMODUS: Querschnitts-Konsistenz zwischen zwei Deklarationen (die in CLAUDE.md
# benannte Ausnahme zu T002448-M4). Die Invariante existiert nicht im Laufzeitverhalten
# einer einzelnen Komponente, sondern in der Beziehung zweier Quellen: scripts/llm/loadouts.json
# sagt, auf welchem Port llama.cpp lauscht; die Migration in scripts/migrations/ sagt, wohin
# der Proxy routet. Laufen sie auseinander, startet das Modell und der Proxy schickt trotzdem
# ins Leere — ohne Fehlermeldung an der Stelle, an der man sucht.
#
# WARUM DIESER GUARD NACHTRAEGLICH ENTSTEHT: T002645 plante das Loadout auf Port 8097 mit
# UD-Q4_K_XL. Geliefert wurde es dann von T002753 auf Port 8094 mit UD-IQ3_XXS. Loadout und
# Backend-Zeile stimmen heute ueberein — aber nichts hat das geprueft, und genau die Art
# Doppelquelle ist in dieser Codebasis schon mehrfach auseinandergelaufen. Der Test sichert
# also bestehendes Verhalten ab; er ist kein RED-GREEN-Schritt fuer neues Verhalten.
#
# NICHT GEPRUEFT (bewusst, andernorts abgedeckt):
#   - Existenz der Modelldatei  -> loadout-model-files-exist.bats (T002753)
#   - kanonische JSON-Form      -> loadouts-format.bats (T002553)
#   - Port-Literale im Gateway  -> gateway-consumer-lint.bats (T002582)
#
# KEINE EINDEUTIGKEITS-PRUEFUNG AUF PORTS: Port 8091 wird von gemma26-factory, gemma4-base
# und gemma4-tuned geteilt. Das ist zulaessig, weil alle drei in exclusiveGroup "chat-gpu"
# liegen und nie gleichzeitig laufen. Ein Guard "jeder Port genau einmal" waere also falsch.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LOADOUTS="${REPO_ROOT}/scripts/llm/loadouts.json"
  BACKEND_MIGRATION="${REPO_ROOT}/scripts/migrations/2026-08-04-llm-proxy-gemma-qwen-families.sql"
  QWEN_SLUG="qwen3-coder-30b"
  QWEN_BACKEND="llamacpp-qwen"
}

@test "T002645: das qwen3-coder-Loadout ist registriert und nennt einen Port (Anker)" {
  [ -f "$LOADOUTS" ]

  run jq -r --arg s "$QWEN_SLUG" '[.loadouts[] | select(.slug == $s)] | length' "$LOADOUTS"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]

  run jq -r --arg s "$QWEN_SLUG" '.loadouts[] | select(.slug == $s) | .port' "$LOADOUTS"
  [ "$status" -eq 0 ]
  # Ein Port, kein null und keine leere Ausgabe — sonst waere jede Aussage darueber wertlos.
  [[ "$output" =~ ^[0-9]+$ ]]

  # Das Loadout teilt sich die GPU mit den uebrigen Chat-Loadouts; ohne diese Gruppe
  # koennten zwei Modelle gleichzeitig starten und sich den VRAM streitig machen.
  run jq -r --arg s "$QWEN_SLUG" '.loadouts[] | select(.slug == $s) | .exclusiveGroup' "$LOADOUTS"
  [ "$output" = "chat-gpu" ]
}

@test "T002645: Loadout-Port und Proxy-Backend-Registrierung nennen denselben Port" {
  [ -f "$BACKEND_MIGRATION" ]

  loadout_port="$(jq -r --arg s "$QWEN_SLUG" '.loadouts[] | select(.slug == $s) | .port' "$LOADOUTS")"
  [[ "$loadout_port" =~ ^[0-9]+$ ]]

  # POSITIV-ANKER (T002356-M1) ZUERST: die Backend-Zeile muss ueberhaupt existieren und einen
  # Port tragen. Ohne ihn bestuende der Vergleich vakuos — zwei leere Zeichenketten sind
  # gleich, und der Test waere auch dann gruen, wenn die Registrierung ganz fehlte.
  backend_port="$(grep -F "'${QWEN_BACKEND}'" "$BACKEND_MIGRATION" \
    | grep -oE 'http://127\.0\.0\.1:[0-9]+' | grep -oE '[0-9]+$' | head -1)"
  [ -n "$backend_port" ]
  [[ "$backend_port" =~ ^[0-9]+$ ]]

  # Eigentliche Aussage.
  [ "$loadout_port" = "$backend_port" ]
}
