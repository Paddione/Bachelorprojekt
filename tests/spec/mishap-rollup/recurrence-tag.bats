#!/usr/bin/env bats
# tests/spec/mishap-rollup/recurrence-tag.bats — T013305 Mechanismus A (Rezurrenz-Tag)
#
# PRUEFMODUS: OUTPUT-VERIFIKATION [T002448-M4]. rollup-recurrence.sh wird mit
# einem synthetischen Verlaufs-Strom ausgefuehrt; geprueft werden stdout und
# Exit-Code. Das ×N-Rendering wird an rollup-plan-tasks.sh gemessen (gleiche
# Tuer wie der Generator: ROLLUP_RECURRENCE_FILE).
#
# Hintergrund: Rezurrenz ueber Batches war unsichtbar — der SCS-Embed-Fehler
# fiel in Batch 08-20 UND 08-22 ohne Korrelation. Der Dedupe beim Melden prueft
# nur offene Tickets + Buffer, nie die Batch-Historie.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  REC="$REPO_ROOT/scripts/factory/rollup-recurrence.sh"
  WORK="$BATS_TEST_TMPDIR/work"
  mkdir -p "$WORK"
}

# Verlaufs-Strom: zwei Zyklen teilen einen Eintrag (SCS-Embed), jeder hat
# zusaetzlich einen eigenen Eintrag. Format wie mishap-rollup.sh ihn aus der
# DB liest: Zyklus-Marker, Sentinel, dann der Flusher-Batch.
_history_stream() {
  cat <<'EOF'
<<<ROLLUP-CYCLE>>>	T012909
<<<ROLLUP-COMMENT>>>
### Mishap-Rollup — 2 Eintraege

**1. SCS-Embed unerreichbar** (degraded, localhost:8081)

**2. MTP-Crash transient** (broken, llm-proxy)
<<<ROLLUP-CYCLE>>>	T013107
<<<ROLLUP-COMMENT>>>
### Mishap-Rollup — 2 Eintraege

**1. SCS-Embed unerreichbar** (degraded, localhost:8081)

**2. Watchdog pipeline stale** (drift, factory)
EOF
}

@test "ein in zwei Zyklen wiederholter Eintrag wird als Rezurrenz gemeldet" {
  _history_stream > "$WORK/history.txt"
  run bash "$REC" --all < "$WORK/history.txt"
  [ "$status" -eq 0 ]
  # Positiv-Anker: das wiederholte Paar ist mit Anzahl und Vorzyklen dabei ...
  printf '%s\n' "$output" | grep -F 'SCS-Embed unerreichbar' | grep -qF 'T012909'
  line="$(printf '%s\n' "$output" | grep -F 'SCS-Embed unerreichbar')"
  printf '%s\n' "$line" | grep -qF 'T013107'
  count="$(printf '%s\n' "$line" | cut -f1)"
  [ "$count" -ge 2 ]
}

@test "ein einmaliger Eintrag traegt keinen Rezurrenz-Marker" {
  _history_stream > "$WORK/history.txt"
  run bash "$REC" --all < "$WORK/history.txt"
  [ "$status" -eq 0 ]
  # Positiv-Anker zuerst: das wiederholte Paar ist in derselben Ausgabe ...
  printf '%s\n' "$output" | grep -qF 'SCS-Embed unerreichbar'
  # ... die Einmal-Eintraege erscheinen NICHT.
  [ "$(printf '%s\n' "$output" | grep -cF 'MTP-Crash transient')" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep -cF 'Watchdog pipeline stale')" -eq 0 ]
}

@test "der Generator rendert ×N mit Vorzyklus-Referenz in den Eintragskopf" {
  _history_stream > "$WORK/history.txt"
  bash "$REC" --all < "$WORK/history.txt" > "$WORK/recurrence.tsv"

  printf '<<<ROLLUP-COMMENT>>>\n### Mishap-Rollup\n\n**1. SCS-Embed unerreichbar** (degraded, localhost:8081)\n' \
    > "$WORK/comments.txt"
  ROLLUP_RECURRENCE_FILE="$WORK/recurrence.tsv" \
    run bash "$REPO_ROOT/scripts/factory/rollup-plan-tasks.sh" < "$WORK/comments.txt"
  [ "$status" -eq 0 ]
  # Positiv-Anker: der Eintrag wurde ueberhaupt gerendert ...
  printf '%s\n' "$output" | grep -qF 'SCS-Embed unerreichbar'
  # ... mit ×N und beiden Vorzyklen.
  entry="$(printf '%s\n' "$output" | grep -F 'SCS-Embed unerreichbar')"
  printf '%s\n' "$entry" | grep -qF '×2'
  printf '%s\n' "$entry" | grep -qF 'T012909'
  printf '%s\n' "$entry" | grep -qF 'T013107'
}

@test "ohne Rezurrenz-Daten bleibt das Rendering unveraendert" {
  printf '<<<ROLLUP-COMMENT>>>\n### Mishap-Rollup\n\n**1. SCS-Embed unerreichbar** (degraded, localhost:8081)\n' \
    > "$WORK/comments.txt"
  run bash "$REPO_ROOT/scripts/factory/rollup-plan-tasks.sh" < "$WORK/comments.txt"
  [ "$status" -eq 0 ]
  entry="$(printf '%s\n' "$output" | grep -F 'SCS-Embed unerreichbar')"
  [ "$(printf '%s\n' "$entry" | grep -cF '×')" -eq 0 ]
}
