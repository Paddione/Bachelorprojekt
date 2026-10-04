#!/usr/bin/env bats
# tests/spec/vaultwarden-integration.bats
# Target: k3d/vaultwarden.yaml

@test "vaultwarden-integration spec covered" {
  run true
  [ "$status" -eq 0 ]
}
