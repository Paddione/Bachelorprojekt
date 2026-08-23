#!/usr/bin/env bats
# Die brain:ingest:*-Tasks reichen ihre Fallback-Defaults durch; explizit
# gesetzte Werte bleiben massgeblich.
#
# Historie: T013042 schrieb sieben Defaults fest (u.a. :8089/gemma12-vision),
# T013593 liess die Tasks den Swap-Wrapper aufrufen und entfernte URL/Modell/
# Slot-Zahl aus dem Taskfile. Seit dem T014339-Nachzug ist der Wrapper obsolet:
# beide Tasks rufen scripts/brain-ingest.sh DIREKT auf und setzen nur noch
# LM_DISABLE_THINKING=1 und LM_TIMEOUT=600.
#
# Bewusst NICHT mehr im Taskfile: LM_STUDIO_URL, LM_MODEL, LM_MAX_TOKENS,
# MAX_SOURCE_CHARS, MAX_PARALLEL. brain-ingest.sh ist die alleinige Quelle
# dafuer (FreeToken-native :1919 / Qwen3.6-35B-A3B-NVFP4, 3072 Output-Tokens,
# 16k-Chunks, np=4) — ein zweiter Port-Default im Taskfile waere genau die
# Drift, wegen der der Guard in tests/spec/local-llm-proxy/brain-ingest-port.bats
# existiert, und das Root-Taskfile hat mit brain:ingest:dry/:8093 (T014543)
# gezeigt, dass genau diese Drift real passiert. Env-Vererbung reicht jede
# vorgesetzte Variable trotzdem an das Skript durch; die Zusicherung von
# T013042 ("vorgesetzte Werte gewinnen") bleibt unverändert gueltig.
#
# PRUEFMODUS: Output-Verifikation (T002448-M4) — ein Fake-bash protokolliert
# die environment, mit der der eigentliche Einstiegspunkt gestartet wuerde.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  TASKFILE="$REPO_ROOT/taskfiles/Taskfile.brain.yaml"
  FAKE_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$FAKE_BIN"
  # Gelabelte Zeilen statt roher Werte: leere Variablen ("das Taskfile setzt
  # das bewusst nicht") sind damit vom Fehlen des Aufrufs unterscheidbar.
  cat > "$FAKE_BIN/bash" <<'SHEOF'
#!/bin/sh
printf 'url=%s\nmodel=%s\ndisable_thinking=%s\nmax_tokens=%s\ntimeout=%s\nmax_source_chars=%s\nmax_parallel=%s\nscript=%s\n' \
  "$LM_STUDIO_URL" "$LM_MODEL" "$LM_DISABLE_THINKING" "$LM_MAX_TOKENS" \
  "$LM_TIMEOUT" "$MAX_SOURCE_CHARS" "$MAX_PARALLEL" "$1"
SHEOF
  chmod +x "$FAKE_BIN/bash"
}

run_task() {  # <task-name>, ohne vorgesetzte Ingest-Variablen
  run env -u LM_STUDIO_URL -u LM_MODEL -u LM_DISABLE_THINKING \
    -u LM_MAX_TOKENS -u LM_TIMEOUT -u MAX_SOURCE_CHARS -u MAX_PARALLEL \
    PATH="$FAKE_BIN:$PATH" task --taskfile "$TASKFILE" "$1"
}

@test "the ingest tasks call brain-ingest.sh directly with their two defaults" {
  run_task ingest:run
  [ "$status" -eq 0 ]

  # POSITIV-ANKER: der Fake-bash muss ueberhaupt gelaufen sein UND den neuen
  # Einstiegspunkt sehen — sonst waeren alle Abwesenheits-Aussagen vakuos.
  [[ "$output" == *"script=scripts/brain-ingest.sh"* ]]

  [[ "$output" == *"disable_thinking=1"* ]]
  [[ "$output" == *$'\ntimeout=600\n'* ]]

  # Die fünf bewusst nicht gesetzten Variablen kommen LEER an (Skript-Default
  # gilt), sie sind also nicht nur unsichtbar, sondern belegt nicht gesetzt.
  # Zeilen-verankerte Greps statt $'\n..\n'-Substrings: der task-Banner laeuft
  # ueber STDERR, der Fake-bash-Output ueber STDOUT — deren Interleaving ist
  # umgebungsabhaengig (lokal Banner-zuerst, CI teils Output-zuerst), sodass
  # ein fuehrendes \n vor "url=" NICHT garantiert ist [T015012-CI-Fix].
  printf '%s\n' "$output" | grep -qx 'url='
  printf '%s\n' "$output" | grep -qx 'model='
  printf '%s\n' "$output" | grep -qx 'max_tokens='
  printf '%s\n' "$output" | grep -qx 'max_source_chars='
  printf '%s\n' "$output" | grep -qx 'max_parallel='
}

@test "the ingest tasks name no backend URL, model or retired endpoint" {
  for task_name in ingest:run ingest:pilot; do
    run_task "$task_name"
    [ "$status" -eq 0 ]

    # Positiv-Anker vor den Negativ-Aussagen (T002356-M1).
    [[ "$output" == *"script=scripts/brain-ingest.sh"* ]]

    # Keine der historischen Endpunkt-Angaben darf zurueckkehren: der
    # Loadout-Port 8089 (T013042), der tote Ingest-Pool 8093 (T014543),
    # die stillgelegten Modelle und der obsolete Wrapper (T014339).
    [[ "$output" != *"8089"* ]]
    [[ "$output" != *"8093"* ]]
    [[ "$output" != *"gemma12-vision"* ]]
    [[ "$output" != *"gemma-4-12b-qat"* ]]
    [[ "$output" != *"swap.sh"* ]]
  done
}

@test "pre-set brain ingest values reach the script through env inheritance" {
  run env PATH="$FAKE_BIN:$PATH" \
    LM_STUDIO_URL=http://example.test:9999 LM_MODEL=custom-model \
    LM_DISABLE_THINKING=0 LM_MAX_TOKENS=42 LM_TIMEOUT=43 \
    MAX_SOURCE_CHARS=44 MAX_PARALLEL=2 \
    task --taskfile "$TASKFILE" ingest:run

  [ "$status" -eq 0 ]
  [[ "$output" == *"url=http://example.test:9999"* ]]
  [[ "$output" == *"model=custom-model"* ]]
  [[ "$output" == *"disable_thinking=0"* ]]
  [[ "$output" == *"max_tokens=42"* ]]
  [[ "$output" == *$'\ntimeout=43\n'* ]]
  [[ "$output" == *"max_source_chars=44"* ]]
  [[ "$output" == *"max_parallel=2"* ]]
}

@test "run pilot share the same fallback block and entrypoint" {
  for task_name in ingest:run ingest:pilot; do
    run_task "$task_name"
    [ "$status" -eq 0 ]
    [[ "$output" == *"script=scripts/brain-ingest.sh"* ]]
    [[ "$output" == *"disable_thinking=1"* ]]
    [[ "$output" == *$'\ntimeout=600\n'* ]]
    printf '%s\n' "$output" | grep -qx 'url='   # siehe Kommentar in Fall 1 [T015012-CI-Fix]
  done
}
