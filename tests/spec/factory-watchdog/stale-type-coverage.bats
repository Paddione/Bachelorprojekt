#!/usr/bin/env bats
# tests/spec/factory-watchdog/stale-type-coverage.bats [T002674]
#
# PRÜFMODUS: Output-Verifikation. Der Test ruft `watchdog.sh --print-stale-query`
# als Kommando auf und prüft dessen stdout. Kein Source-Grep: die Query wird vom
# Skript selbst gerendert, ein Umbau der Bedingung schlägt hier also durch, auch
# wenn der Quelltext ganz anders aussieht.
#
# HINTERGRUND: Der Watchdog wählte die stale-Kandidaten über eine Allowlist:
#   WHERE type IN ('feature','feat','task','chore') AND status='in_progress' …
# Gemessen am 2026-08-04 nennt diese Liste zwei Typen, die es gar nicht mehr gibt
# (`feature` 0 Zeilen, `task` 0 Zeilen — beide bei der Typ-Konsolidierung
# abgelöst), und übersieht fünf existierende: `fix` (670 Zeilen, zweithäufigster
# Typ), `refactor`, `perf`, `test`, `incident`.
#
# Folge: drei hängende fix-Tickets belegten alle drei Factory-Slots 2h54m lang
# ohne ein einziges factory_phase_events. Der Watchdog hätte sie nach 30 Minuten
# zurückgesetzt — er sah sie nie. Die Factory nahm derweil kein weiteres Ticket
# an und meldete lediglich "keine ready plan_staged Tickets".
#
# Eine Allowlist altert in die unsichere Richtung: jeder neue Typ ist per Default
# unsichtbar. Deshalb prüft dieser Test auf eine Denylist-Formulierung.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  WD="$REPO_ROOT/scripts/factory/watchdog.sh"
}

@test "watchdog: stale-Query erfasst type=fix" {
  run bash "$WD" --print-stale-query

  # Positiv-Anker [T002356-M1]: erst belegen, dass überhaupt eine Query kam.
  # Ohne ihn wäre jede Aussage über ihren Inhalt trivial wahr, sobald das Skript
  # den Modus nicht kennt und leer beendet.
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  [[ "$output" == *"status='in_progress'"* ]]

  # Kernaussage: ein fix-Ticket darf nicht durch den Typ-Filter fallen.
  # Entweder gibt es gar keinen Typ-Filter, oder 'fix' ist nicht ausgeschlossen.
  if [[ "$output" == *"type IN ("* ]]; then
    [[ "$output" == *"'fix'"* ]]
  fi
  [[ "$output" != *"NOT IN"*"'fix'"* ]]
}

@test "watchdog: stale-Query erfasst auch refactor, perf, test und chore" {
  run bash "$WD" --print-stale-query

  [ "$status" -eq 0 ]
  [ -n "$output" ]

  # Diese Typen existieren real in der Datenbank und belegen Slots wie jeder
  # andere. Eine Allowlist, die sie vergisst, macht sie fuer den Watchdog blind.
  local t
  for t in refactor perf test chore; do
    if [[ "$output" == *"type IN ("* ]]; then
      [[ "$output" == *"'$t'"* ]]
    fi
    [[ "$output" != *"NOT IN"*"'$t'"* ]]
  done
}

@test "watchdog: project und incident bleiben ausgeschlossen" {
  run bash "$WD" --print-stale-query

  [ "$status" -eq 0 ]
  [ -n "$output" ]

  # Positiv-Anker: erst belegen, dass ueberhaupt eine Ausschlussliste existiert —
  # sonst waere die Aussage "X ist ausgeschlossen" gegen eine Query ohne Filter
  # trivial falsch und gegen eine leere Ausgabe trivial wahr.
  [[ "$output" == *"NOT IN"* ]]

  # 'project' ist der Epic-Container, 'incident' ist needs_human — beide werden
  # von queue.sh nie dispatcht, koennen also keinen Slot belegen. Der Ausschluss
  # ist mit queue.sh abgestimmt (T002329/T002333/T002407); weichen die beiden
  # Listen auseinander, sieht der Watchdog Tickets, die es gar nicht geben kann.
  [[ "$output" == *"'project'"* ]]
  [[ "$output" == *"'incident'"* ]]
}

@test "watchdog: --print-stale-query fasst die Datenbank nicht an" {
  # Der Diagnosemodus muss ohne Cluster/DB funktionieren — sonst ist er im
  # Fehlerfall, also genau dann, wenn man ihn braucht, nicht benutzbar.
  run env FACTORY_CTX=does-not-exist bash "$WD" --print-stale-query

  [ "$status" -eq 0 ]
  [ -n "$output" ]
  [[ "$output" == *"in_progress"* ]]
}
