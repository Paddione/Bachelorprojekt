#!/usr/bin/env bats
# FA-SF-49: offline arg-validation for `ticket.sh inject` + `get-injections`. [factory-injection]
# All cases validate BEFORE _pgpod, so they are deterministic without a cluster (CI-safe).
setup() { load 'test_helper.bash'; }

@test "FA-SF-49: inject requires --id and --kind" {
  run bash scripts/ticket.sh inject --content "hi"
  [ "$status" -eq 2 ]
  [[ "$output" =~ "required" ]]
}
@test "FA-SF-49: inject rejects an invalid kind" {
  run bash scripts/ticket.sh inject --id T000001 --kind frobnicate
  [ "$status" -eq 2 ]
  [[ "$output" =~ "kind must be one of" ]]
}
@test "FA-SF-49: inject rejects an invalid phase" {
  run bash scripts/ticket.sh inject --id T000001 --kind note --phase sideways --content x
  [ "$status" -eq 2 ]
  [[ "$output" =~ "phase must be one of" ]]
}
@test "FA-SF-49: inject asset requires --file or --nc-path" {
  run bash scripts/ticket.sh inject --id T000001 --kind asset
  [ "$status" -eq 2 ]
  [[ "$output" =~ "asset requires" ]]
}
@test "FA-SF-49: inject --file rejects a missing file" {
  run bash scripts/ticket.sh inject --id T000001 --kind asset --file /no/such/file.png
  [ "$status" -eq 2 ]
  [[ "$output" =~ "not a file" ]]
}
@test "FA-SF-49: get-injections requires --id" {
  run bash scripts/ticket.sh get-injections
  [ "$status" -eq 2 ]
  [[ "$output" =~ "required" ]]
}
@test "FA-SF-49: get-injections rejects an invalid --phase" {
  run bash scripts/ticket.sh get-injections --id T000001 --phase nope
  [ "$status" -eq 2 ]
  [[ "$output" =~ "phase must be one of" ]]
}
@test "FA-SF-49: dispatch usage lists inject and get-injections" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "inject" ]]
  [[ "$output" =~ "get-injections" ]]
}
