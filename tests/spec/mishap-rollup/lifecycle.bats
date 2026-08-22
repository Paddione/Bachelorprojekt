#!/usr/bin/env bats

@test "mishap-rollup spec does not contain obsolete resolution" {
  run grep -q "resolution=obsolete" openspec/specs/mishap-rollup.md
  [ "$status" -eq 1 ]
}

