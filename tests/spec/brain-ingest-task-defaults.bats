#!/usr/bin/env bats
# T013042 — die brain:ingest:*-Tasks reichen Fallback-Defaults durch; explizit
# gesetzte Werte bleiben massgeblich.
#
# GEAENDERT DURCH T013593. T013042 hatte sieben Defaults festgeschrieben,
# darunter LM_STUDIO_URL=http://127.0.0.1:8089, LM_MODEL=gemma12-vision und
# MAX_PARALLEL=1. Diese drei sind entfallen: sie standen im Widerspruch zum
# Requirement "Loadout-Ports und lokale Port-Forwards sind disjunkt", das
# Loadout, Skript-Default und Backend-Migration auf denselben Port (8100)
# festlegt — der Taskfile nannte 8089. Seit T013593 setzt sie
# scripts/brain-ingest-swap.sh aus dem brain-ingest-Loadout, also aus genau der
# Quelle, die das Port-Requirement meint. Ein zweiter Ort, der denselben Port
# nennt, war die Drift, die T013593 behebt.
#
# Die Zusicherung von T013042 bleibt unveraendert gueltig: vorgesetzte Werte
# gewinnen gegen jeden Default.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  TASKFILE="$REPO_ROOT/taskfiles/Taskfile.brain.yaml"
  FAKE_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$FAKE_BIN"
  # Gibt zusaetzlich das aufgerufene Skript aus: welcher Einstiegspunkt laeuft,
  # ist seit T013593 Teil der Zusicherung und nicht mehr nur Beiwerk.
  cat > "$FAKE_BIN/bash" <<'SHEOF'
#!/bin/sh
printf '%s\n' \
  "$LM_STUDIO_URL" "$LM_MODEL" "$LM_DISABLE_THINKING" "$LM_MAX_TOKENS" \
  "$LM_TIMEOUT" "$MAX_SOURCE_CHARS" "$MAX_PARALLEL" "script=$1"
SHEOF
  chmod +x "$FAKE_BIN/bash"
}

run_task() {  # <task-name>, ohne vorgesetzte Ingest-Variablen
  run env -u LM_STUDIO_URL -u LM_MODEL -u LM_DISABLE_THINKING \
    -u LM_MAX_TOKENS -u LM_TIMEOUT -u MAX_SOURCE_CHARS -u MAX_PARALLEL \
    PATH="$FAKE_BIN:$PATH" task --taskfile "$TASKFILE" "$1"
}

@test "T013042 brain ingest task supplies the local fallback defaults" {
  run_task ingest:run
  [ "$status" -eq 0 ]

  # POSITIV-ANKER: der Fake-bash muss ueberhaupt gelaufen sein. Ohne ihn waeren
  # die Abwesenheits-Aussagen unten vakuos — eine leere Ausgabe enthaelt jeden
  # verbotenen Wert nicht.
  [[ "$output" == *"script="* ]]

  # Die vier Defaults, die der Taskfile weiterhin setzt.
  [[ "$output" == *$'1\n65536\n3600\n150000'* ]]
}

@test "T013593 the tasks name neither backend URL nor model nor slot count" {
  run_task ingest:run
  [ "$status" -eq 0 ]
  [[ "$output" == *"script="* ]]

  # Diese drei kommen aus dem Loadout, nicht aus dem Taskfile.
  [[ "$output" != *"8089"* ]]
  [[ "$output" != *"gemma12-vision"* ]]
}

@test "T013593 the ingest tasks call the swap wrapper" {
  for task_name in ingest:run ingest:pilot; do
    run_task "$task_name"
    [ "$status" -eq 0 ]
    [[ "$output" == *"script=scripts/brain-ingest-swap.sh"* ]]
  done
}

@test "T013042 pre-set brain ingest values override every default" {
  run env PATH="$FAKE_BIN:$PATH" \
    LM_STUDIO_URL=http://example.test:9999 LM_MODEL=custom-model \
    LM_DISABLE_THINKING=0 LM_MAX_TOKENS=42 LM_TIMEOUT=43 \
    MAX_SOURCE_CHARS=44 MAX_PARALLEL=2 \
    task --taskfile "$TASKFILE" ingest:run

  [ "$status" -eq 0 ]
  [[ "$output" == *$'http://example.test:9999\ncustom-model\n0\n42\n43\n44\n2'* ]]
}

@test "T013042 run pilot and dry share the same fallback block" {
  for task_name in ingest:run ingest:pilot; do
    run_task "$task_name"
    [ "$status" -eq 0 ]
    [[ "$output" == *$'1\n65536\n3600\n150000'* ]]
  done
}
