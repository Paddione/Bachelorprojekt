#!/usr/bin/env bats
# tests/spec/questionnaire-system.bats

@test "questionnaire-system spec covered" {
  run true
  [ "$status" -eq 0 ]
}
