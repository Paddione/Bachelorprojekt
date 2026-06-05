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

@test "FA-SF-35: dryrun-mark requires --id" {
  run bash scripts/ticket.sh dryrun-mark
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--id" ]]
}
@test "FA-SF-35: dryrun-check requires --id" {
  run bash scripts/ticket.sh dryrun-check
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--id" ]]
}
@test "FA-SF-35: dispatch usage lists dryrun-mark" {
  run bash scripts/ticket.sh
  [[ "$output" =~ "dryrun-mark" ]]
}

@test "FA-SF-35: feature-flag set requires --brand --key --enabled" {
  run bash scripts/ticket.sh feature-flag set --brand mentolder --key new-hero
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--enabled" ]]
}
@test "FA-SF-35: feature-flag set rejects a non-boolean --enabled" {
  run bash scripts/ticket.sh feature-flag set --brand mentolder --key x --enabled maybe
  [ "$status" -eq 2 ]
  [[ "$output" =~ "true|false" ]]
}
@test "FA-SF-35: feature-flag get requires --brand and --key" {
  run bash scripts/ticket.sh feature-flag get --brand mentolder
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--key" ]]
}
@test "FA-SF-35: feature-flag list requires --brand" {
  run bash scripts/ticket.sh feature-flag list
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--brand" ]]
}
@test "FA-SF-35: dispatch usage lists feature-flag" {
  run bash scripts/ticket.sh
  [[ "$output" =~ "feature-flag" ]]
}


