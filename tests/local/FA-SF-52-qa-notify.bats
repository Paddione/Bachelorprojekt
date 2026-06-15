#!/usr/bin/env bats
# FA-SF-52: offline arg-validation für scripts/factory/qa-notify.sh [T000730]
setup() { load 'test_helper.bash'; }

@test "FA-SF-52: qa-notify.sh is executable" {
  [ -x scripts/factory/qa-notify.sh ]
}

@test "FA-SF-52: --event is required" {
  run bash scripts/factory/qa-notify.sh --ticket-id T000001 --title "x" --slug foo
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--event" ]]
}

@test "FA-SF-52: rejects invalid --event" {
  run bash scripts/factory/qa-notify.sh --event launch --ticket-id T1 --title x --slug s
  [ "$status" -eq 2 ]
  [[ "$output" =~ "qa_review" ]] || [[ "$output" =~ "done" ]]
}

@test "FA-SF-52: --ticket-id is required" {
  run bash scripts/factory/qa-notify.sh --event qa_review --title "x" --slug foo
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--ticket-id" ]]
}

@test "FA-SF-52: --slug is required" {
  run bash scripts/factory/qa-notify.sh --event qa_review --ticket-id T1 --title "x"
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--slug" ]]
}

@test "FA-SF-52: --help exits 0 with usage" {
  run bash scripts/factory/qa-notify.sh --help
  [ "$status" -eq 0 ]
  [[ "$output" =~ "qa-notify" ]]
}
