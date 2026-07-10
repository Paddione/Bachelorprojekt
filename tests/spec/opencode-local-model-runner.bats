#!/usr/bin/env bash
set -e
# T001780: opencode-local-model-runner — Implementation Plan
# SSOT: openspec/changes/opencode-local-model-runner/tasks.md

load 'test_helper'

@test "runner-is-self-hosted-fleet-gpu" {
  # Current state (post-change)
  run yq eval -r '.jobs.opencode.runs-on' .github/workflows/opencode.yml
  [ "$status" -eq 0 ] || { echo "yq failed: $output"; exit 1; }
  [[ "$result" == *"[self-hosted, fleet-gpu]"* ]] || { echo "Result was: $result"; exit 1; }
}

@test "if-condition-has-fork-guard" {
  # Current state (post-change)
  run grep "github.repository" .github/workflows/opencode.yml
  [ "$status" -eq 0 ]
}

@test "opencode-step-uses-local-model" {
  # Current state (post-change)
  run yq eval -r '.jobs.opencode.steps[1].with.model' .github/workflows/opencode.yml
  [ "$status" -eq 0 ] || { echo "yq failed: $output"; exit 1; }
  [[ "$result" == *"llamacpp-mtp/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"* ]] || { echo "Result was: $result"; exit 1; }
}
