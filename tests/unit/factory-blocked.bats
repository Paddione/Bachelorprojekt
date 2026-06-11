#!/usr/bin/env bats
# factory-blocked.bats — Unit tests for blocker detection in schedule.sh (TDR-2)
# Static tests: schedule.sh checks depends_on before claiming.

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

setup() {
  export PROJECT_DIR
  SCHEDULE="${PROJECT_DIR}/scripts/factory/schedule.sh"
  QUEUE="${PROJECT_DIR}/scripts/factory/queue.sh"
}

@test "static: schedule.sh exists" {
  [ -f "$SCHEDULE" ]
}

@test "static: schedule.sh checks depends_on for blockers" {
  grep -q "depends_on" "$SCHEDULE"
}

@test "static: schedule.sh queries blocker status" {
  grep -q "blocker" "$SCHEDULE" || grep -q "blocked" "$SCHEDULE"
}

@test "static: schedule.sh skips blocked tickets" {
  grep -q "continue" "$SCHEDULE"
}

@test "static: schedule.sh uses conflict-check before claim" {
  grep -q "conflict-check" "$SCHEDULE"
}

@test "static: schedule.sh iterates candidates" {
  grep -q "candidates" "$SCHEDULE"
}

@test "static: schedule.sh claims slots" {
  grep -q "slots.sh.*claim" "$SCHEDULE"
}

@test "static: queue.sh queries backlog features" {
  grep -q "status='backlog'" "$QUEUE"
}

@test "static: queue.sh orders by priority" {
  grep -q "priority" "$QUEUE"
}

@test "static: schedule.sh has global cap enforcement" {
  grep -q "GLOBAL_CAP" "$SCHEDULE"
}
