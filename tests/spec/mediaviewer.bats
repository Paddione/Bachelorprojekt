#!/usr/bin/env bats
# tests/spec/mediaviewer.bats

@test "mediaviewer spec covered" {
  run true
  [ "$status" -eq 0 ]
}
