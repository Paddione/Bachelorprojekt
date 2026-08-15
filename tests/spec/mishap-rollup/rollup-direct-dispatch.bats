#!/usr/bin/env bats
# tests/spec/mishap-rollup/rollup-direct-dispatch.bats — T007056
#
# SSOT: openspec/specs/mishap-rollup.md
# PRUEFMODUS (T002448-M4): Statement-Verifikation gegen die Skripte — der
# Generator-Umbau wird ueber sein emittiertes Verhalten gepinnt (stage-plan-
# Aufruf statt update-status), der Finder ueber sein WHERE-Praedikat, die
# Beschreibung ueber das INSERT-Textfragment.
#
# Hintergrund: Der Rollup-Plan ging bisher per PR auf main (T004898). Das
# erzeugte pro Zyklus einen manuellen PR-Schritt und einen CI-Freshness-Gap.
# T007056 stellt auf Staged-Lane-Dispatch um: der Generator staged den Plan
# auf den Container, der Executor implementiert ihn, Merge=Closure schliesst.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/factory/mishap-rollup.sh"
  TICKET_SH="$REPO_ROOT/scripts/ticket.sh"
}

@test "T007056: Generator staged den Plan auf den Container statt ihn zu schliessen" {
  # stage-plan --no-hold muss vorhanden sein, der alte Closure-Weg nicht mehr.
  run grep -n "stage-plan" "$SCRIPT"
  [ "$status" -eq 0 ]
  grep -qF -- "--no-hold" <<<"$output"
  run grep -cE "update-status.*--status done" "$SCRIPT"
  [ "$output" = "0" ]
}

@test "T007056: rollup-container sucht nur Collect-Mode-Container (plan_staged ausgeschlossen)" {
  # Das WHERE-Praedikat des Finders: positive Collect-Mode-Liste + blocked-Nuance,
  # keine NOT-IN-Exclusion-Liste mehr.
  run grep -n "status IN ('triage','backlog','planning')" "$TICKET_SH"
  [ "$status" -eq 0 ]
  run grep -n "status = 'blocked'" "$TICKET_SH"
  [ "$status" -eq 0 ]
  run grep -cE "status NOT IN \('done','archived'\)" "$TICKET_SH"
  [ "$output" = "0" ]
}

@test "T007056: frische Container-Beschreibung nennt den Executor-Closure-Lifecycle" {
  # Die Create-Description darf keine Generator-Closure behaupten, sondern muss
  # den neuen Lifecycle nennen: Staging auf dem Container, Closure nach
  # Executor-Merge mit resolution=fixed.
  run grep -n "resolution=fixed" "$TICKET_SH"
  [ "$status" -eq 0 ]
  run grep -c "bleibt dauerhaft offen" "$TICKET_SH"
  [ "$output" = "0" ]
}
