#!/usr/bin/env bats
# SSOT: openspec/specs/ci-cd.md
# Requirement: PR-Gate — Vitest (website) mit Step-Level Fast-Path

setup() {
  bats_require_minimum_version 1.5.0
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  CI_WF="$REPO_ROOT/.github/workflows/ci.yml"
}

@test "ci.yml: Vitest (website) has step-level filter checking components/website/" {
  run grep -A10 'Check coverage relevance' "$CI_WF"
  # Fast-path filter should expose run_website output or check components/website/ diff
  run grep -E '(run_website=true|run-website=true)' "$CI_WF"
  [ "$status" -eq 0 ]
}

@test "ci.yml: Vitest (website) guards pnpm install with run_website filter" {
  run grep -B2 -A5 'Install website dependencies' "$CI_WF"
  [ "$status" -eq 0 ]
  [[ "$output" == *"run_website == 'true'"* ]] || [[ "$output" == *"run-website == 'true'"* ]]
}

@test "ci.yml: actionlint installation uses caching" {
  run grep -B2 -A10 'actions/cache' "$CI_WF"
  [ "$status" -eq 0 ]
  [[ "$output" == *"actionlint"* ]]
}
