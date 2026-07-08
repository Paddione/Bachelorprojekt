#!/usr/bin/env bats
# tests/spec/brain-mcp.bats
# SSOT: openspec/changes/brain-llm-wiki/proposal.md (Change 5: brain-mcp)
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  SERVER="$REPO_ROOT/scripts/brain-mcp-server.py"
  WORK="$(mktemp -d)"
  mkdir -p "$WORK/wiki"
  echo "---\ntype: note\ntags: [test]\nstatus: active\n---\n# Test\ntest content\n" > "$WORK/wiki/test-note.md"
}
teardown() { rm -rf "$WORK"; }

@test "mcp-server serves brain:// resource" {
  run python3 "$SERVER" --wiki "$WORK/wiki" --resource "brain://wiki/test-note"
  [ "$status" -eq 0 ]
  [[ "$output" == *"test content"* ]]
}

@test "mcp-server search finds by tag" {
  run python3 "$SERVER" --wiki "$WORK/wiki" --search "test"
  [ "$status" -eq 0 ]
  [[ "$output" == *"test-note"* ]]
}

@test "mcp-server returns error for missing page" {
  run python3 "$SERVER" --wiki "$WORK/wiki" --resource "brain://wiki/ghost"
  [ "$status" -ne 0 ]
}
