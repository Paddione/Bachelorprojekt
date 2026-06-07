#!/usr/bin/env bats
# FA-SF-45: the conflict gate must not deadlock the backlog when multiple queued
# features share files (e.g. all 8 Brett tickets share messages.ts/state.ts).
# Fix: (a) conflict-check.sh drops 'backlog' from active statuses — only
# in_progress/in_review block; (b) pipeline.js releases slot + resets to backlog
# on conflict (prevents wedged in_progress tickets).

@test "FA-SF-45: conflict-check.sh does NOT count backlog as active" {
  run grep -Eq "t\.status IN \('in_progress','in_review'\)" scripts/factory/conflict-check.sh
  [ "$status" -eq 0 ]
  run grep -Eq "'backlog'" scripts/factory/conflict-check.sh
  [ "$status" -ne 0 ]
}

@test "FA-SF-45: pipeline.js releases slot + resets to backlog on conflict" {
  # the conflict-block path must include release-slot (template: ${A.ticket_id})
  run bash -c "grep -Eq 'release-slot.*--id.*ticket_id' scripts/factory/pipeline.js && grep -Eq 'update-status.*--id.*ticket_id.*backlog' scripts/factory/pipeline.js"
  [ "$status" -eq 0 ]
}

@test "FA-SF-45: pipeline.js conflict-block return includes released:true" {
  run grep -Eq "released: true" scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-45: scheme.sh claim sets status=in_progress (the gate sees it)" {
  run grep -Eq "status='in_progress'" scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-45: offline parsing passes" {
  run node --check scripts/factory/pipeline.js;   [ "$status" -eq 0 ]
  run bash -n scripts/factory/conflict-check.sh;  [ "$status" -eq 0 ]
  run bash -n scripts/factory/slots.sh;           [ "$status" -eq 0 ]
}
