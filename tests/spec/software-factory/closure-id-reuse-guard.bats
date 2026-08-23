#!/usr/bin/env bats
# tests/spec/software-factory/closure-id-reuse-guard.bats
# SSOT: openspec/changes/ticket-lifecycle-hardening/specs/software-factory.md
# Tickets: T015010 / T015014 — Post-Merge-Closure korroboriert jeden aus dem
# PR-Titel aufgeloesten external_id, bevor sie schliesst (Incident T015005:
# ID-Reuse nach Zeilenloeschung schloss das falsche Ticket).
#
# PRUEFMODUS: COMMAND OUTPUT VERIFICATION — die reine Einheit
# `ticket_corroborates` wird per source aus scripts/factory/auto-close-merged.sh
# aufgerufen und ihr Exit-Code geprueft; kein grep auf den Quelltext.

load '_sf_common'

setup() { _sf_setup; }

_corroborates() {
  run bash -c 'source "'"$REPO_ROOT"'/scripts/factory/auto-close-merged.sh"; ticket_corroborates "$1" "$2" "$3" "$4"' _ "$1" "$2" "$3" "$4"
}

@test "T015010: plan_ref-Branch gleich PR-Head-Branch → korroboriert" {
  _corroborates "fix/lifecycle-T015000" "5150" "FACTORY-PLAN-REF branch=fix/lifecycle-T015000 plan=openspec/changes/x/tasks.md" ""
  [ "$status" -eq 0 ]
}

@test "T015010: Branch weicht ab, aber expliziter PR-Link existiert → korroboriert" {
  _corroborates "fix/other-branch" "5150" "FACTORY-PLAN-REF branch=fix/lifecycle-T015000 plan=openspec/changes/x/tasks.md" "5150"
  [ "$status" -eq 0 ]
}

@test "T015010: Branch weicht ab und kein PR-Link → NICHT korroboriert (ID-Reuse-Verdacht)" {
  _corroborates "fix/lifecycle-T015000" "5150" "FACTORY-PLAN-REF branch=fix/other-T014999 plan=openspec/changes/y/tasks.md" ""
  [ "$status" -ne 0 ]
}

@test "T015010: leerer plan_ref und kein PR-Link → NICHT korroboriert" {
  _corroborates "fix/lifecycle-T015000" "5150" "" ""
  [ "$status" -ne 0 ]
}

@test "T015010: PR-Link-Liste matcht exakte Nummer, nicht nur Praefix" {
  _corroborates "fix/other-branch" "51" "" "5150
5151"
  [ "$status" -ne 0 ]
}
