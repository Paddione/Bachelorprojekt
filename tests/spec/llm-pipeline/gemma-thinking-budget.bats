#!/usr/bin/env bats
# tests/spec/llm-pipeline/gemma-thinking-budget.bats
# SSOT: openspec/specs/llm-pipeline.md
# Ticket: T002501
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Die Tests
# rufen die Body-/Payload-Bauer auf und pruefen das erzeugte JSON — kein grep auf
# Script-Interna.
#
# Hintergrund: Der lokale Gemma-Server laeuft mit thinking=1. Er schreibt zuerst
# nach reasoning_content; content bleibt LEER, bis das Denken abgeschlossen ist.
# Ist max_tokens vorher erschoepft, kommt finish_reason=length mit leerem content
# zurueck — ohne Fehler und ohne Log. Gemessen 2026-08-01 am laufenden Server,
# identischer Prompt, temperature 0:
#
#   max_tokens 20                            -> length, content '',        58 Zeichen reasoning
#   max_tokens 500                           -> length, content '',      1635 Zeichen reasoning
#   max_tokens 8192 + enable_thinking:false  -> stop,   content 'Data loss', 0
#   max_tokens 20   + enable_thinking:false  -> stop,   content 'Data loss', 0
#
# Die letzte Zeile ist der Punkt: 20 Tokens genuegen OHNE Thinking fuer das, woran
# 500 Tokens MIT Thinking scheitern. Mehr max_tokens ist die falsche Reaktion —
# der Hebel ist chat_template_kwargs.enable_thinking=false.
#
# Warum die Bauer in eigenen Dateien liegen: auto-triage.sh hat keinen
# Sourcing-Guard (Argument-Parsing und BRAND-Pflicht laufen beim Sourcen los, dann
# folgt die DB), und der health-goals-Payload steckte in einem inline python3 -c
# mitten in der Kandidaten-Schleife. Beides ist ohne laufenden Server und ohne DB
# nicht erreichbar. Die Bauer sind deshalb herausgezogen — genau so weit, dass ein
# Offline-Test an ihr Ergebnis kommt.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TRIAGE_BODY="$REPO/scripts/factory/triage-body.sh"
  HG_PAYLOAD="$REPO/scripts/health-goals-payload.py"
  SCHEMA='{"name":"ticket_triage","strict":true,"schema":{"type":"object"}}'
}

@test "triage body builder is sourceable without side effects" {
  # Muss ohne BRAND, ohne DB und ohne Netz sourcebar sein — sonst ist der
  # Offline-Test unten gar nicht moeglich.
  [ -f "$TRIAGE_BODY" ]
  run bash -c "source '$TRIAGE_BODY' && declare -F _build_triage_body"
  [ "$status" -eq 0 ]
}

@test "triage body disables thinking for locally served models" {
  run bash -c "source '$TRIAGE_BODY' && _build_triage_body \
      'gemma-4-12b' 'http://127.0.0.1:18235/v1' 'sys' 'user' '$SCHEMA'"
  [ "$status" -eq 0 ]

  run bash -c "source '$TRIAGE_BODY' && _build_triage_body \
      'gemma-4-12b' 'http://127.0.0.1:18235/v1' 'sys' 'user' '$SCHEMA' \
      | jq -r '.chat_template_kwargs.enable_thinking'"
  echo "local baseUrl -> $output"
  [ "$output" = "false" ]
}

@test "triage body omits the thinking flag for remote providers" {
  # POSITIV-ANKER (T002356-M1) zuerst: der lokale Fall MUSS das Feld setzen.
  # Ohne ihn bestuende dieser Test vakuos — fehlt die Funktion, waere das Feld
  # ueberall abwesend und die Negativ-Aussage trivial erfuellt.
  run bash -c "source '$TRIAGE_BODY' && _build_triage_body \
      'gemma-4-12b' 'http://127.0.0.1:18235/v1' 'sys' 'user' '$SCHEMA' \
      | jq -r '.chat_template_kwargs.enable_thinking'"
  echo "anchor (local) -> $output"
  [ "$output" = "false" ]

  # Der eigentliche Gegenstand: remote APIs duerfen das Feld NICHT bekommen —
  # chat_template_kwargs ist dort ein unbekanntes Feld und kann abgelehnt werden.
  run bash -c "source '$TRIAGE_BODY' && _build_triage_body \
      'deepseek-chat' 'https://api.deepseek.com/v1' 'sys' 'user' '$SCHEMA' \
      | jq -r 'has(\"chat_template_kwargs\")'"
  echo "remote baseUrl -> $output"
  [ "$output" = "false" ]
}

@test "triage body keeps the response_format schema intact" {
  # Das Gate darf den Rest des Bodys nicht beschaedigen: json_schema-Constraining
  # ist der Grund, warum die Triage ueberhaupt valide Enums liefert.
  run bash -c "source '$TRIAGE_BODY' && _build_triage_body \
      'gemma-4-12b' 'http://127.0.0.1:18235/v1' 'sys' 'user' '$SCHEMA' \
      | jq -r '.response_format.type'"
  echo "response_format.type -> $output"
  [ "$output" = "json_schema" ]
}

@test "health-goals payload disables thinking" {
  [ -f "$HG_PAYLOAD" ]
  run bash -c "echo 'Kontext' | python3 '$HG_PAYLOAD' 'bonsai' 'G-DORA03' \
      | jq -r '.chat_template_kwargs.enable_thinking'"
  echo "hg payload -> $output"
  [ "$output" = "false" ]
}

@test "health-goals payload keeps model, json_object format and token budget" {
  # Positiv-Anker fuer die Payload-Form: das Skript parst die Antwort als JSON
  # und protokolliert jedes Goal als 'unfillable', wenn content leer bleibt.
  # Geht response_format oder das Modell verloren, ist der Fix wertlos.
  run bash -c "echo 'Kontext' | python3 '$HG_PAYLOAD' 'bonsai' 'G-DORA03' \
      | jq -r '[.model, .response_format.type, (.max_tokens|tostring)] | @tsv'"
  echo "hg payload core -> $output"
  [ "$output" = "$(printf 'bonsai\tjson_object\t300')" ]
}
