#!/usr/bin/env bats
# SSOT: openspec/specs/ci-cd.md
# Tests for factory shard optimization (T013528):
# - the Go ticket-mcp:test step was removed (node-mcp-servers P6 cleanup)
# - test-factory-shard does NOT reference the removed ticket-mcp:test

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CI_WF="$REPO_ROOT/.github/workflows/ci.yml"
}

@test "T013528: ticket-mcp:test is no longer invoked anywhere in ci.yml" {
  # After node-mcp-servers P6 cleanup the Go test step was removed entirely;
  # no job may reference task ticket-mcp:test (the task no longer exists).
  python3 -c "
import yaml, sys
with open('$CI_WF') as f:
    doc = yaml.safe_load(f)
for jname, j in doc.get('jobs', {}).items():
    steps = j.get('steps', [])
    runs = [s.get('run', '') for s in steps]
    found = any('ticket-mcp:test' in r for r in runs)
    assert not found, f'ticket-mcp:test still present in job {jname}'
"
}

@test "T013528: test-factory-shard does not execute ticket-mcp:test" {
  # Job test-factory-shard must NOT run task ticket-mcp:test redundantly
  python3 -c "
import yaml, sys
with open('$CI_WF') as f:
    doc = yaml.safe_load(f)
steps = doc.get('jobs', {}).get('test-factory-shard', {}).get('steps', [])
runs = [s.get('run', '') for s in steps]
found = any('ticket-mcp:test' in r for r in runs)
assert not found, 'ticket-mcp:test still present in test-factory-shard'
"
}
