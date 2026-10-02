#!/usr/bin/env bats
# SSOT: docs/superpowers/specs/ci-cd.md
# Tests for spec shard optimization (T013528):
# - ticket-mcp:test runs in test-spec-fast
# - test-spec-shard does NOT run ticket-mcp:test

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CI_WF="$REPO_ROOT/.github/workflows/ci.yml"
}

@test "T013528: test-spec-fast executes ticket-mcp:test" {
  # Job test-spec-fast must contain task ticket-mcp:test
  python3 -c "
import yaml, sys
with open('$CI_WF') as f:
    doc = yaml.safe_load(f)
steps = doc.get('jobs', {}).get('test-spec-fast', {}).get('steps', [])
runs = [s.get('run', '') for s in steps]
found = any('ticket-mcp:test' in r for r in runs)
assert found, 'ticket-mcp:test not found in test-spec-fast'
"
}

@test "T013528: test-spec-shard does not execute ticket-mcp:test" {
  # Job test-spec-shard must NOT run task ticket-mcp:test redundantly
  python3 -c "
import yaml, sys
with open('$CI_WF') as f:
    doc = yaml.safe_load(f)
steps = doc.get('jobs', {}).get('test-spec-shard', {}).get('steps', [])
runs = [s.get('run', '') for s in steps]
found = any('ticket-mcp:test' in r for r in runs)
assert not found, 'ticket-mcp:test still present in test-spec-shard'
"
}
