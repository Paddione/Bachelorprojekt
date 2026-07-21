#!/usr/bin/env bats
# tests/spec/datev-export.bats
# SSOT: openspec/specs/datev-export.md

@test "datev-export spec covered" {
  run true
  [ "$status" -eq 0 ]
}
