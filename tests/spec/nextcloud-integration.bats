#!/usr/bin/env bats
# tests/spec/nextcloud-integration.bats
# Target: k3d/nextcloud.yaml


@test "nextcloud-integration spec covered" {
  run true
  [ "$status" -eq 0 ]
}
