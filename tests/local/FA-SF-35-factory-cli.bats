#!/usr/bin/env bats
# FA-SF-35: offline arg-validation for Phase 3 factory ticket.sh subcommands. [T000413]
setup() { load 'test_helper.bash'; }

@test "FA-SF-35: retry-count requires an action verb" {
  run bash scripts/ticket.sh retry-count --id T000001
  [ "$status" -eq 2 ]
  [[ "$output" =~ "get|incr|reset" ]]
}
@test "FA-SF-35: retry-count get requires --id" {
  run bash scripts/ticket.sh retry-count get
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--id" ]]
}
@test "FA-SF-35: factory-control set requires --key and --value" {
  run bash scripts/ticket.sh factory-control set --key killswitch
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--value" ]]
}
@test "FA-SF-35: factory-control get requires --key" {
  run bash scripts/ticket.sh factory-control get
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--key" ]]
}
@test "FA-SF-35: dispatch usage lists factory-control" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "factory-control" ]]
}
