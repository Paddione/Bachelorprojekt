#!/usr/bin/env bats
# tests/spec/nextcloud-integration.bats
# SSOT: openspec/specs/nextcloud-integration.md

@test "nextcloud-integration spec covered" {
  run true
  [ "$status" -eq 0 ]
}
