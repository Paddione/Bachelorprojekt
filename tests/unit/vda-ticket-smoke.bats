#!/usr/bin/env bats
# tests/unit/vda-ticket-smoke.bats
# Offline test: ticket subcommand dispatch + validation before cluster.

TICKET_SH="$BATS_TEST_DIRNAME/../../scripts/vda/ticket.sh"

@test "ticket help exits 0" {
  run bash "$TICKET_SH" help
  [ "$status" -eq 0 ]
  [[ "$output" == *"subcommands"* ]]
}

@test "ticket create fails without required parameters (deterministic, no cluster)" {
  run bash "$TICKET_SH" create
  [ "$status" -eq 2 ]
}

@test "ticket get fails without --id" {
  run bash "$TICKET_SH" get
  [ "$status" -eq 2 ]
}

@test "ticket unknown subcommand passes through to ticket.sh and exits 1" {
  run bash "$TICKET_SH" nonexistent
  [ "$status" -eq 1 ]
  [[ "$output" == *"Unknown command"* ]]
}

@test "vda.sh help lists all commands" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/vda.sh" help
  [ "$status" -eq 0 ]
  [[ "$output" == *"oracle"* ]]
  [[ "$output" == *"promote"* ]]
  [[ "$output" == *"ticket"* ]]
  [[ "$output" == *"factory-prep"* ]]
}

@test "ticket help lists triage subcommand" {
  run bash "$TICKET_SH" help
  [ "$status" -eq 0 ]
  [[ "$output" == *"triage"* ]]
}

@test "ticket unknown subcommand passes through to ticket.sh and exits 1" {
  run bash "$TICKET_SH" nonexistent
  [ "$status" -eq 1 ]
  [[ "$output" == *"Unknown command"* ]]
}

@test "vda.sh promote --help exits 0 (promote.sh must exist)" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/vda.sh" promote --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"promote"* ]]
}

@test "vda.sh promote with unknown flag gives controlled error" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/vda.sh" promote --bad-flag
  [ "$status" -eq 2 ]
  [[ "$output" == *"Unknown option"* ]]
}

@test "vda.sh ticket feature-flag without brand reaches ticket.sh" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/vda.sh" ticket feature-flag get
  [[ "$output" == *"--brand is required"* ]] || [[ "$output" == *"ERROR"* ]]
}

@test "vda.sh ticket help lists pass-through subcommands" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/vda.sh" ticket help
  [ "$status" -eq 0 ]
  [[ "$output" == *"extracted"* ]] || [[ "$output" == *"pass"* ]] || [[ "$output" == *"through"* ]]
  [[ "$output" == *"feature-flag"* ]]
}
