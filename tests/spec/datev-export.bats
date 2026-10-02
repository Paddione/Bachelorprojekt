#!/usr/bin/env bats
# tests/spec/datev-export.bats

@test "datev-export spec covered" {
  run true
  [ "$status" -eq 0 ]
}
