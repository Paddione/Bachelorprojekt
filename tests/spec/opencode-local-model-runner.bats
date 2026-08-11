#!/usr/bin/env bash
set -e
# T001780: opencode-local-model-runner — Implementation Plan
# SSOT: openspec/changes/opencode-local-model-runner/tasks.md

load 'test_helper'

@test "runner-is-self-hosted-fleet-gpu" {
  run grep "runs-on: \[self-hosted, fleet-gpu\]" .github/workflows/opencode.yml
  [ "$status" -eq 0 ]
}

@test "if-condition-has-fork-guard" {
  run grep "github.repository" .github/workflows/opencode.yml
  [ "$status" -eq 0 ]
}

@test "opencode-step-uses-local-model" {
  run grep "model: llamacpp-local/gemma26-factory" .github/workflows/opencode.yml
  [ "$status" -eq 0 ]
}
