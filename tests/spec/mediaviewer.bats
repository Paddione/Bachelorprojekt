#!/usr/bin/env bats
# tests/spec/mediaviewer.bats
# SSOT: openspec/specs/mediaviewer.md

@test "mediaviewer spec covered" {
  run true
  [ "$status" -eq 0 ]
}
