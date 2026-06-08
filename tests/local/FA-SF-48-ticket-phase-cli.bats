#!/usr/bin/env bats
# FA-SF-48: offline arg-validation for the `ticket.sh phase` subcommand. [T-FACTORY-FLOOR]
# (Renamed from the plan's FA-SF-40 — that number is taken by FA-SF-40-provision.bats.)
# All cases validate BEFORE _pgpod, so they are deterministic without a cluster (CI-safe).
setup() { load 'test_helper.bash'; }

@test "FA-SF-48: phase requires ext_id, phase and state" {
  run bash scripts/ticket.sh phase
  [ "$status" -eq 2 ]
  [[ "$output" =~ "Usage" ]]
}
@test "FA-SF-48: phase rejects an invalid phase name" {
  run bash scripts/ticket.sh phase T000001 frobnicate entered
  [ "$status" -eq 2 ]
  [[ "$output" =~ "phase must be one of" ]]
}
@test "FA-SF-48: phase rejects an invalid state" {
  run bash scripts/ticket.sh phase T000001 scout sideways
  [ "$status" -eq 2 ]
  [[ "$output" =~ "state must be one of" ]]
}
@test "FA-SF-48: phase rejects an invalid driver" {
  run bash scripts/ticket.sh phase T000001 scout entered --driver gemini
  [ "$status" -eq 2 ]
  [[ "$output" =~ "driver must be one of" ]]
}
@test "FA-SF-48: dispatch usage lists phase" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "phase" ]]
}
