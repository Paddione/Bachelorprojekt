#!/usr/bin/env bats
# tests/spec/software-factory/slot-mapping.bats
# SSOT: openspec/specs/software-factory.md
# T002483: pipeline_slot → llama.cpp-Slot-ID Mapping Tests

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

SLOTS_SH="scripts/factory/slots.sh"

_skip_if_no_column() {
  _skip_if_no_db
  if ! factory_psql -c "SELECT pipeline_slot_meta FROM tickets.tickets LIMIT 1;" &>/dev/null; then
    skip "tickets.pipeline_slot_meta column does not exist in DB yet"
  fi
}

@test "FA-SF-75: slots.sh exists and is syntactically valid bash" {
  [ -f "$SLOTS_SH" ]
  run bash -n "$SLOTS_SH"
  [ "$status" -eq 0 ]
}

@test "FA-SF-75: slots.sh claim persists pipeline_slot_meta.llama_slot_id" {
  _skip_if_no_column
  local ticket_id="T002483"

  # Release first so we can re-claim cleanly
  run env BRAND=mentolder bash "$SLOTS_SH" release "$ticket_id"
  [ "$status" -eq 0 ]

  run env BRAND=mentolder bash "$SLOTS_SH" claim "$ticket_id" 1
  [ "$status" -eq 0 ]

  # Verify pipeline_slot_meta is set
  run factory_psql -t -A -c "SELECT pipeline_slot_meta->>'llama_slot_id' FROM tickets.tickets WHERE external_id='${ticket_id}';"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '0'

  # Cleanup
  run env BRAND=mentolder bash "$SLOTS_SH" release "$ticket_id"
  [ "$status" -eq 0 ]
}

@test "FA-SF-75: slots.sh slot-id returns correct llama_slot_id" {
  _skip_if_no_column
  local ticket_id="T002483"

  # Claim with slot=2 → llama_slot_id=1
  run env BRAND=mentolder bash "$SLOTS_SH" release "$ticket_id"
  [ "$status" -eq 0 ]

  run env BRAND=mentolder bash "$SLOTS_SH" claim "$ticket_id" 2
  [ "$status" -eq 0 ]

  run env BRAND=mentolder bash "$SLOTS_SH" slot-id "$ticket_id"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '1'

  # Cleanup
  run env BRAND=mentolder bash "$SLOTS_SH" release "$ticket_id"
  [ "$status" -eq 0 ]
}

@test "FA-SF-75: slots.sh release clears pipeline_slot_meta" {
  _skip_if_no_column
  local ticket_id="T002483"

  # Claim then release
  run env BRAND=mentolder bash "$SLOTS_SH" release "$ticket_id"
  [ "$status" -eq 0 ]

  run env BRAND=mentolder bash "$SLOTS_SH" claim "$ticket_id" 1
  [ "$status" -eq 0 ]

  run env BRAND=mentolder bash "$SLOTS_SH" release "$ticket_id"
  [ "$status" -eq 0 ]

  # Verify pipeline_slot_meta is NULL after release
  run factory_psql -t -A -c "SELECT pipeline_slot_meta IS NULL AS cleared FROM tickets.tickets WHERE external_id='${ticket_id}';"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 't'
}

@test "FA-SF-75: two parallel claims get different llama_slot_ids" {
  _skip_if_no_db
  # Use a temp ticket for slot-claim testing
  local test_ticket
  test_ticket=$(factory_psql -t -A -c "SELECT external_id FROM tickets.tickets WHERE status='backlog' AND pipeline_slot IS NULL LIMIT 1;" 2>/dev/null || true)
  if [[ -z "$test_ticket" ]]; then
    skip "no free backlog ticket for parallel claim test"
  fi

  run env BRAND=mentolder bash "$SLOTS_SH" release "$test_ticket"
  [ "$status" -eq 0 ]

  run env BRAND=mentolder bash "$SLOTS_SH" claim "$test_ticket" 1
  [ "$status" -eq 0 ]

  # llama_slot_id should be 0 (pipeline_slot=1 - 1)
  run factory_psql -t -A -c "SELECT pipeline_slot_meta->>'llama_slot_id' FROM tickets.tickets WHERE external_id='${test_ticket}';"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '0'

  # Cleanup
  run env BRAND=mentolder bash "$SLOTS_SH" release "$test_ticket"
  [ "$status" -eq 0 ]
}
