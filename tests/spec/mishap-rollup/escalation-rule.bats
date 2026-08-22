#!/usr/bin/env bats
# tests/spec/mishap-rollup/escalation-rule.bats — T013305 Mechanismus C
#
# PRUEFMODUS: OUTPUT-VERIFIKATION [T002448-M4]. Der Eskalations-Kandidatenmodus
# von rollup-carryover.sh wird gegen synthetische Zyklus-Plaene gefahren.
#
# Hintergrund: Offene Boxen zirkulierten endlos — der Carryover (T013108)
# trug sie ohne Konsequenz weiter. Ein Eintrag, der in >= 2 abgeschlossenen
# Zyklen offen blieb (oder dessen Watchlist-Zyklus ablaeuft), wird promoted
# und verlaesst die Loop.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CARRY="$REPO_ROOT/scripts/factory/rollup-carryover.sh"
  WORK="$BATS_TEST_TMPDIR/work"
  mkdir -p "$WORK"
}

_cycle_plan() {
  # $1 = Ziel-Dir, $2..: offene Eintragszeilen
  local dir="$1"; shift
  mkdir -p "$dir"
  { printf '# plan\n'
    for line in "$@"; do printf '%s\n' "$line"; done
  } > "$dir/tasks.md"
}

@test "ein Eintrag, der in zwei Zyklen offen blieb, wird eskaliert" {
  _cycle_plan "$WORK/mishap-incident-rollup-2026-08-20-T012909" \
    '- [ ] **2. SCS-Embed unerreichbar** (degraded, localhost:8081) — Disposition: _<...>_ + Begruendung'
  _cycle_plan "$WORK/mishap-incident-rollup-2026-08-22-T013107" \
    '- [ ] **2. SCS-Embed unerreichbar** (degraded, localhost:8081) — Disposition: _<...>_ + Begruendung' \
    '- [ ] **3. Einmal offen** (drift, factory) — Disposition: _<...>_ + Begruendung'

  run bash "$CARRY" --escalations "$WORK" --container T099999
  [ "$status" -eq 0 ]
  # Positiv-Anker: der wiederholt offene Eintrag ist mit beiden Zyklen dabei ...
  line="$(printf '%s\n' "$output" | grep -F 'SCS-Embed unerreichbar')"
  printf '%s\n' "$line" | grep -qF 'T012909'
  printf '%s\n' "$line" | grep -qF 'T013107'
  # ... der nur einmal offene nicht.
  [ "$(printf '%s\n' "$output" | grep -cF 'Einmal offen')" -eq 0 ]
}

@test "ein im aktuellen Container laufender Zyklus zaehlt nicht als Eskalationsgrund" {
  _cycle_plan "$WORK/mishap-incident-rollup-2026-08-20-T012909" \
    '- [ ] **1. Frisch uebernommen** (drift, factory) — Disposition: offen'
  # T099999 ist der LAUFENDE Container — sein Plan ist kein abgeschlossener Zyklus.
  _cycle_plan "$WORK/mishap-incident-rollup-2026-08-22-T099999" \
    '- [ ] **1. Frisch uebernommen** (drift, factory) — Disposition: offen'

  run bash "$CARRY" --escalations "$WORK" --container T099999
  [ "$status" -eq 3 ]
}

@test "ausgeschlossene Titel erscheinen weder im Carry-over noch in der Watchlist" {
  _cycle_plan "$WORK/mishap-incident-rollup-2026-08-20-T012909" \
    '- [ ] **2. Bereits eskaliert** (broken, llm-proxy) — offen' \
    '- [ ] **3. Bleibt in der Loop** (drift, factory) — offen'
  printf 'Bereits eskaliert\n' > "$WORK/exclude.txt"

  run bash "$CARRY" --plan "$WORK/mishap-incident-rollup-2026-08-20-T012909/tasks.md" \
    --slug mishap-incident-rollup-2026-08-20-T012909 --exclude-file "$WORK/exclude.txt"
  [ "$status" -eq 0 ]
  # Positiv-Anker: der nicht-eskalierte Eintrag wird uebertragen ...
  printf '%s\n' "$output" | grep -qF 'Bleibt in der Loop'
  # ... der eskalierte ist ausgeschieden.
  [ "$(printf '%s\n' "$output" | grep -cF 'Bereits eskaliert')" -eq 0 ]
}
