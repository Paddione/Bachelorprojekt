#!/usr/bin/env bats
# FA-SF-50: offline arg-validation for `ticket.sh stage-plan` (Kommissionierung).
# Validierung passiert VOR _pgpod (FA-SF-35-Muster) -> kein Cluster nötig.
setup() { load 'test_helper.bash'; }

@test "FA-SF-50: stage-plan requires --id" {
  run bash scripts/ticket.sh stage-plan --branch feature/x --plan docs/p.md
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--id" ]]
}
@test "FA-SF-50: stage-plan requires --branch" {
  run bash scripts/ticket.sh stage-plan --id T000001 --plan docs/p.md
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--branch" ]]
}
@test "FA-SF-50: stage-plan requires --plan" {
  run bash scripts/ticket.sh stage-plan --id T000001 --branch feature/x
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--plan" ]]
}
@test "FA-SF-50: stage-plan rejects unknown option" {
  run bash scripts/ticket.sh stage-plan --id T000001 --branch b --plan p --bogus x
  [ "$status" -eq 2 ]
  [[ "$output" =~ "Unknown" ]]
}
@test "FA-SF-50: dispatch usage lists stage-plan" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "stage-plan" ]]
}
