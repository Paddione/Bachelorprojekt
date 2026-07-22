#!/usr/bin/env bats
# FA-SF-40: adaptive agent-provisioning (offline, pure function). Wraps the
# node:test suite and asserts the pure-module contract used by pipeline.js.
MOD="scripts/factory/provision.js"
SUITE="scripts/factory/provision.test.mjs"

@test "FA-SF-40: provision.js exists and is syntactically valid ESM" {
  [ -f "$MOD" ]
  run node --check "$MOD"
  [ "$status" -eq 0 ]
}

@test "FA-SF-40: node --test provision suite passes" {
  run node --test "$SUITE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"fail 0"* ]]
}

@test "FA-SF-40: exports the three contract functions" {
  for fn in "export function chooseModel" "export function chooseEffort" "export function provision"; do
    run grep -Fq "$fn" "$MOD"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-40: review/security roles are pinned to opus (correctness-critical)" {
  run grep -Eq "ALWAYS_OPUS_ROLES.*=.*new Set" "$MOD"; [ "$status" -eq 0 ]
  run grep -q "'review'" "$MOD"; [ "$status" -eq 0 ]
  run grep -q "'security'" "$MOD"; [ "$status" -eq 0 ]
}

@test "FA-SF-40: context is compact-hint based (no raw-dump), GPU-gated similar-tickets" {
  run grep -q "buildContextHints" "$MOD"; [ "$status" -eq 0 ]
  run grep -q "gpuEmbeddings === true" "$MOD"; [ "$status" -eq 0 ]
  run grep -q "similar-tickets" "$MOD"; [ "$status" -eq 0 ]
}
