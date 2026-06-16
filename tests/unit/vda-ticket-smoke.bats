#!/usr/bin/env bats
# tests/unit/vda-ticket-smoke.bats
# Offline test: ticket subcommand dispatch + validation before cluster.

TICKET_SH="$BATS_TEST_DIRNAME/../../scripts/vda/ticket.sh"

@test "ticket help exits 0" {
  run bash "$TICKET_SH" help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Subcommands"* ]]
}

@test "ticket create fails without required parameters (deterministic, no cluster)" {
  run bash "$TICKET_SH" create
  [ "$status" -eq 2 ]
}

@test "ticket get fails without --id" {
  run bash "$TICKET_SH" get
  [ "$status" -eq 2 ]
}

@test "ticket unknown subcommand exits 2" {
  run bash "$TICKET_SH" nonexistent
  [ "$status" -eq 2 ]
  [[ "$output" == *"Unknown ticket subcommand"* ]]
}

@test "vda.sh help lists all commands" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/vda.sh" help
  [ "$status" -eq 0 ]
  [[ "$output" == *"oracle"* ]]
  [[ "$output" == *"promote"* ]]
  [[ "$output" == *"ticket"* ]]
  [[ "$output" == *"factory-prep"* ]]
}
