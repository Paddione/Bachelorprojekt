#!/usr/bin/env bats
# tests/spec/factory-watchdog/factory-excluded-scope.bats [T006364]
#
# PRÜFMODUS: Output-Verifikation. Der Test ruft `watchdog.sh --print-stale-query`
# als Kommando auf und prüft dessen stdout. Kein Source-Grep: die Query wird vom
# Skript selbst gerendert, ein Umbau der Bedingung schlägt hier also durch, auch
# wenn der Quelltext ganz anders aussieht (Konvention T002448-M4, Vorbild:
# stale-type-coverage.bats).
#
# HINTERGRUND (T006364): Bei manueller dev-flow-execute-Übernahme eines
# Factory-gestagten Tickets (T005560, Fortsetzungs-Kontrakt T002327) resettete
# watchdog.sh (FACTORY_STALE_MIN=0) das in_progress-Ticket alle ~5 Minuten auf
# plan_staged; queue.sh dispatchte es erneut, die Pipeline deferrierte am fremden
# branch-scoped Claim (T003677) und liess den Status in_progress — Livelock mit
# Kommentar-Noise (beobachtet 22:41–22:54 UTC, Timeline T005560). Beendet erst
# durch manuelles `ticket.sh plan-meta set --readiness factory_excluded=true`.
# queue.sh ehrt readiness.factory_excluded=true in BEIDEN Dispatch-Lanes (der
# "durable half of ticket.sh unfactory"), der Watchdog-Stale-Sweep nicht. Dieser
# Test verlangt denselben Gate in der Stale-Query.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  WD="$REPO_ROOT/scripts/factory/watchdog.sh"
}

@test "watchdog: stale-Query erfasst weiterhin in_progress-Tickets" {
  run bash "$WD" --print-stale-query

  # Positiv-Anker [T002356-M1]: erst belegen, dass überhaupt eine Query kam und
  # der Sweep in_progress-Tickets erfasst. Ohne ihn wäre jede Negativ-Aussage
  # trivial wahr, sobald das Skript den Modus nicht kennt und leer beendet.
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  [[ "$output" == *"status='in_progress'"* ]]
}

@test "watchdog: stale-Query schliesst factory_excluded=true aus" {
  run bash "$WD" --print-stale-query

  [ "$status" -eq 0 ]
  [ -n "$output" ]

  # Kernaussage: Tickets mit readiness.factory_excluded=true dürfen keine
  # Stale-Kandidaten sein — dasselbe Gate, das queue.sh in beiden
  # Dispatch-Lanes anwendet. Rot ohne Fix: die Query enthält den Filter nicht.
  [[ "$output" == *"factory_excluded"* ]]
  [[ "$output" == *"readiness"* ]]
}
