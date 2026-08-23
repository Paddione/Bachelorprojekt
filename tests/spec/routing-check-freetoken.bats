#!/usr/bin/env bats

@test "routing-check meldet kein veraltetes gemma12-vision@18235" {
  run bash scripts/llm/routing-check.sh
  [[ "${output}" != *"gemma12-vision"* ]]
}
