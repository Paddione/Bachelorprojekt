#!/usr/bin/env bats
# FA-SF-70 — provider routing CLI + wrappers (offline; DB-touching paths skipped).
setup() { load 'test_helper.bash'; }

@test "FA-SF-70: provider-config.sh prints usage and exits non-zero with no args" {
  run bash scripts/factory/provider-config.sh
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage"* ]]
}

@test "FA-SF-70: provider-config.sh set rejects tier=opus" {
  run bash scripts/factory/provider-config.sh set --source x --tier opus --priority 1 --provider anthropic --model m
  [ "$status" -ne 0 ]
  [[ "$output" == *"opus"* ]]
}

@test "FA-SF-70: provider-config.sh set requires all mandatory flags" {
  run bash scripts/factory/provider-config.sh set --source x --tier sonnet
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage"* ]]
}

@test "FA-SF-70: route-provider.sh emits valid JSON keys for opus without DB" {
  run bash scripts/factory/route-provider.sh factory-plan opus
  [ "$status" -eq 0 ]
  # Post qwythos-9b-v2 migration: opus routes to local lmstudio, not Anthropic cloud.
  echo "$output" | jq -e '.modelId and (.provider=="lmstudio")'
}

@test "FA-SF-70: route-provider.sh requires source and tier args" {
  run bash scripts/factory/route-provider.sh
  [ "$status" -ne 0 ]
}

@test "FA-SF-70: release-slot.sh requires a provider arg" {
  run bash scripts/factory/release-slot.sh
  [ "$status" -ne 0 ]
}

@test "FA-SF-70: release-slot.sh accepts null slotId (no-op)" {
  run bash scripts/factory/release-slot.sh null true
  [ "$status" -eq 0 ]
}
