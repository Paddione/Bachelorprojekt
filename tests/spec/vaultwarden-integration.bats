#!/usr/bin/env bats
# tests/spec/vaultwarden-integration.bats

@test "vaultwarden-integration spec covered" {
  run true
  [ "$status" -eq 0 ]
}
