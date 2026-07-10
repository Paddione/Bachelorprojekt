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
  run grep "model: llamacpp-mtp/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf" .github/workflows/opencode.yml
  [ "$status" -eq 0 ]
}
