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
#
# [T015012-CI-Fix] Der Probe-Output geht in eine DATEI, nicht nach stdout:
# go-task gibt seinen Banner auf STDERR aus, das Skript auf STDOUT — deren
# Interleaving ist umgebungsabhaengig (lokal Banner-zuerst, CI teils
# zeilenvermischt), was zeilenverankerte Assertions auf $output zu Zufalls-
# treffern macht. Die Probe-Datei ist davon unberuehrt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  TASKFILE="$REPO_ROOT/taskfiles/Taskfile.brain.yaml"
  FAKE_BIN="$BATS_TEST_TMPDIR/bin"
  PROBE_LOG="$BATS_TEST_TMPDIR/probe.log"
  mkdir -p "$FAKE_BIN"
  # Gelabelte Zeilen statt roher Werte: leere Variablen ("das Taskfile setzt
  # das bewusst nicht") sind damit vom Fehlen des Aufrufs unterscheidbar.
  cat > "$FAKE_BIN/bash" <<SHEOF
#!/bin/sh
printf 'url=%s\nmodel=%s\ndisable_thinking=%s\nmax_tokens=%s\ntimeout=%s\nmax_source_chars=%s\nmax_parallel=%s\nscript=%s\n' \
  "\$LM_STUDIO_URL" "\$LM_MODEL" "\$LM_DISABLE_THINKING" "\$LM_MAX_TOKENS" \
  "\$LM_TIMEOUT" "\$MAX_SOURCE_CHARS" "\$MAX_PARALLEL" "\$1" >> '${PROBE_LOG}'
SHEOF
  chmod +x "$FAKE_BIN/bash"
  : > "$PROBE_LOG"
}

run_task() {  # <task-name>, ohne vorgesetzte Ingest-Variablen
  run env -u LM_STUDIO_URL -u LM_MODEL -u LM_DISABLE_THINKING \
    -u LM_MAX_TOKENS -u LM_TIMEOUT -u MAX_SOURCE_CHARS -u MAX_PARALLEL \
    PATH="$FAKE_BIN:$PATH" PROBE_LOG="$PROBE_LOG" \
    task --taskfile "$TASKFILE" "$1"
}

# Zeilen-exakte Abfrage der Probe: jede Variable kommt als exakt eine Zeile
# 'key=value' an — Leerheit und Belegtheit sind damit positionsunabhaengig.
probe_has() {  # <zeile>
  grep -qxF "$1" "$PROBE_LOG"
}

@test "the ingest tasks call brain-ingest.sh directly with their two defaults" {
  run_task ingest:run
  [ "$status" -eq 0 ]

  # POSITIV-ANKER: der Fake-bash muss ueberhaupt gelaufen sein UND den neuen
  # Einstiegspunkt sehen — sonst waeren alle Abwesenheits-Aussagen vakuos.
  probe_has 'script=scripts/brain-ingest.sh'

  probe_has 'disable_thinking=1'
  probe_has 'timeout=600'

  # Die fünf bewusst nicht gesetzten Variablen kommen LEER an (Skript-Default
  # gilt), sie sind also nicht nur unsichtbar, sondern belegt nicht gesetzt.
  probe_has 'url='
  probe_has 'model='
  probe_has 'max_tokens='
  probe_has 'max_source_chars='
  probe_has 'max_parallel='
}

@test "the ingest tasks name no backend URL, model or retired endpoint" {
  for task_name in ingest:run ingest:pilot; do
    : > "$PROBE_LOG"
    run_task "$task_name"
    [ "$status" -eq 0 ]
    probe_has 'script=scripts/brain-ingest.sh'
    # Weder im Taskfile noch im aufgerufenen Befehl darf ein Endpoint/Modell
    # stecken — die Probe-Zeilen muessen leer bleiben.
    probe_has 'url='
    probe_has 'model='
  done
  ! grep -rqE '8089|gemma12-vision|localhost:19|127\.0\.0\.1:19' "$TASKFILE"
}

@test "pre-set brain ingest values reach the script through env inheritance" {
  : > "$PROBE_LOG"
  run env LM_STUDIO_URL="http://preset:9999" LM_MODEL="preset-model" \
    LM_DISABLE_THINKING="0" LM_MAX_TOKENS="42" LM_TIMEOUT="7" \
    MAX_SOURCE_CHARS="1234" MAX_PARALLEL="2" \
    PATH="$FAKE_BIN:$PATH" PROBE_LOG="$PROBE_LOG" \
    task --taskfile "$TASKFILE" ingest:pilot
  [ "$status" -eq 0 ]

  # Vorgesetzte Werte gewinnen (T013042) — das Taskfile nutzt nur :-Defaults.
  probe_has 'url=http://preset:9999'
  probe_has 'model=preset-model'
  probe_has 'disable_thinking=0'
  probe_has 'max_tokens=42'
  probe_has 'timeout=7'
  probe_has 'max_source_chars=1234'
  probe_has 'max_parallel=2'
}

@test "run pilot share the same fallback block and entrypoint" {
  : > "$PROBE_LOG"
  run_task ingest:pilot
  [ "$status" -eq 0 ]

  probe_has 'script=scripts/brain-ingest.sh'
  probe_has 'disable_thinking=1'
  probe_has 'timeout=600'
  probe_has 'url='
}
