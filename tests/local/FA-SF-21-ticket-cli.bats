#!/usr/bin/env bats
# FA-SF-21: offline arg-validation contract for the new ticket.sh subcommands.
setup() { load 'test_helper.bash'; }

@test "FA-SF-21: get requires --id" {
  run bash scripts/ticket.sh get
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--id" ]]
}

@test "FA-SF-21: set-touched-files requires --id and --files" {
  run bash scripts/ticket.sh set-touched-files --id T000001
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--files" ]]
}

@test "FA-SF-21: set-pipeline-slot requires --id and --slot" {
  run bash scripts/ticket.sh set-pipeline-slot --id T000001
  [ "$status" -eq 2 ]
}

@test "FA-SF-21: unknown BRAND is rejected with exit 2" {
  run env BRAND=bogus bash scripts/ticket.sh get --id T000001
  [ "$status" -eq 2 ]
  [[ "$output" =~ "unknown BRAND" ]]
}

@test "FA-SF-21: dispatch lists the new commands in usage" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "set-touched-files" ]]
}

@test "FA-SF-21: enqueue requires --id" {
  run bash scripts/ticket.sh enqueue --branch feature/x --plan docs/p.md
  [ "$status" -eq 2 ]
}
@test "FA-SF-21: enqueue rejects unknown option" {
  run bash scripts/ticket.sh enqueue --id T000001 --bogus z
  [ "$status" -eq 2 ]
}
@test "FA-SF-21: unknown command still errors" {
  run bash scripts/ticket.sh frobnicate
  [ "$status" -ne 0 ]
}
