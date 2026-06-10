#!/usr/bin/env bats
# Offline-safe: prüft nur Arg-Validierung von `ticket.sh plan-meta`, die VOR
# jedem DB-Zugriff (_pgpod) passiert. Kein Cluster nötig.

setup() { TS="$BATS_TEST_DIRNAME/../../scripts/ticket.sh"; }

@test "plan-meta requires a subaction" {
  run bash "$TS" plan-meta
  [ "$status" -ne 0 ]
  [[ "$output" == *"set|get"* ]]
}

@test "plan-meta set rejects missing --id" {
  run bash "$TS" plan-meta set --effort klein
  [ "$status" -ne 0 ]
  [[ "$output" == *"--id"* ]]
}

@test "plan-meta set rejects invalid effort" {
  run bash "$TS" plan-meta set --id T-1 --effort riesig
  [ "$status" -ne 0 ]
  [[ "$output" == *"effort"* ]]
}

@test "plan-meta get rejects missing --id" {
  run bash "$TS" plan-meta get
  [ "$status" -ne 0 ]
  [[ "$output" == *"--id"* ]]
}
