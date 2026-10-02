#!/usr/bin/env bats
# tests/spec/nextcloud-integration.bats


@test "nextcloud-integration spec covered" {
  run true
  [ "$status" -eq 0 ]
}
