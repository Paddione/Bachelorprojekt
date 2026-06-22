#!/usr/bin/env bats
# SSOT: openspec/changes/bats-coverage-batch1/proposal.md
# G-RH03: OpenSpec Coverage 17% -> 23%

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-RH03: secret-rotation spec hat eine BATS-Datei" {
  [ -f "$REPO_ROOT/tests/spec/secret-rotation.bats" ]
}

@test "G-RH03: secrets-deploy-automation spec hat eine BATS-Datei" {
  [ -f "$REPO_ROOT/tests/spec/secrets-deploy-automation.bats" ]
}

@test "G-RH03: backup-pipeline spec hat eine BATS-Datei" {
  [ -f "$REPO_ROOT/tests/spec/backup-pipeline.bats" ]
}

@test "G-RH03: OpenSpec Coverage ist >= 23% (12+ BATS von 53 Specs)" {
  spec_count=$(ls "$REPO_ROOT/openspec/specs/"*.md 2>/dev/null | wc -l)
  bats_count=$(ls "$REPO_ROOT/tests/spec/"*.bats 2>/dev/null | wc -l)
  ratio=$(echo "scale=4; $bats_count * 100 / $spec_count" | bc)
  integer=$(echo "$ratio" | cut -d. -f1)
  [ "$integer" -ge 23 ]
}
