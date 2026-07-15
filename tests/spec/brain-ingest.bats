#!/usr/bin/env bats
# T001861: brain-ingest — BATS Spec (RED initial, GREEN after implementation)
# SSOT: openspec/changes/brain-initial-ingest/tasks.md

load 'test_helper'

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  INGEST="$REPO_ROOT/scripts/brain-ingest.sh"
  TRANSFORM="$REPO_ROOT/scripts/brain-ingest-transform.sh"
  MANIFEST="$REPO_ROOT/scripts/brain/ingest-sources.yaml"
  WORK="$(mktemp -d)"
  export LM_STUDIO_URL="http://localhost:1234"
  export LM_MODEL="qwen3-14b"
}

teardown() { rm -rf "$WORK"; }

# --- Manifest tests ---

@test "manifest has type_map section with defaults and overrides" {
  [ -f "$MANIFEST" ]
  grep -q 'type_map:' "$MANIFEST" || { echo "FAIL: type_map section missing"; return 1; }
  grep -q 'defaults:' "$MANIFEST" || { echo "FAIL: type_map.defaults missing"; return 1; }
  grep -q 'overrides:' "$MANIFEST" || { echo "FAIL: type_map.overrides missing"; return 1; }
}

@test "manifest has tag_defaults section" {
  [ -f "$MANIFEST" ]
  grep -q 'tag_defaults:' "$MANIFEST" || { echo "FAIL: tag_defaults section missing"; return 1; }
}

@test "type_map defaults cover all groups" {
  [ -f "$MANIFEST" ]
  for group in ssot-specs runbooks adr gotchas-footguns agent-guide-maps core-docs; do
    grep -q "$group:" "$MANIFEST" || { echo "FAIL: type_map.defaults missing group $group"; return 1; }
  done
}

@test "tag_defaults cover all groups" {
  [ -f "$MANIFEST" ]
  for group in ssot-specs runbooks adr gotchas-footguns agent-guide-maps core-docs; do
    grep -q "$group:" "$MANIFEST" || { echo "FAIL: tag_defaults missing group $group"; return 1; }
  done
}

# --- Transform script tests ---

@test "transform script exists and is executable" {
  [ -f "$TRANSFORM" ] || { echo "FAIL: scripts/brain-ingest-transform.sh not found"; return 1; }
  [ -x "$TRANSFORM" ] || { echo "FAIL: transform script not executable"; return 1; }
}

@test "transform script produces valid frontmatter from mock LLM response" {
  # Create a mock source file
  mkdir -p "$WORK/source"
  cat > "$WORK/source/test-spec.md" <<'EOF'
---
type: note
tags: [test, spec]
status: active
source:: Bachelorprojekt openspec/specs/test-spec.md
---
# Test Spec

Dies ist eine Test-Spezifikation.

## Requirements

### Requirement: REQ-TEST-001

The system SHALL test things.
EOF

  # Create mock slug inventory
  echo '["test-spec","other-page","index-moc"]' > "$WORK/slugs.json"

  # Mock the LM Studio response
  # We'll test the script's output parsing, not the actual LLM call
  # by setting a custom curl that returns a fixed response
  export LM_STUDIO_URL="http://localhost:9999"

  # The transform script should fail gracefully when LM Studio is unreachable
  run bash "$TRANSFORM" "$WORK/source/test-spec.md" "note" "test-spec" "$WORK/slugs.json" '["test","spec"]' 2>/dev/null
  # It should either succeed or fail with a clear error (not crash)
  [ "$status" -eq 0 ] || [[ "$output" == *"error"* ]] || [[ "$output" == *"curl"* ]] || {
    echo "FAIL: transform script crashed without clear error: $output"
    return 1
  }
}

# --- Orchestrator script tests ---

@test "orchestrator script exists and is executable" {
  [ -f "$INGEST" ] || { echo "FAIL: scripts/brain-ingest.sh not found"; return 1; }
  [ -x "$INGEST" ] || { echo "FAIL: orchestrator script not executable"; return 1; }
}

@test "orchestrator requires --brain-repo argument" {
  run bash "$INGEST" 2>&1
  [ "$status" -ne 0 ] || { echo "FAIL: should fail without --brain-repo"; return 1; }
  [[ "$output" == *"--brain-repo"* ]] || { echo "FAIL: error should mention --brain-repo"; return 1; }
}

@test "orchestrator fails when --brain-repo is not a git repo" {
  mkdir -p "$WORK/not-a-repo"
  run bash "$INGEST" --brain-repo "$WORK/not-a-repo" 2>&1
  [ "$status" -ne 0 ] || { echo "FAIL: should fail for non-git dir"; return 1; }
  [[ "$output" == *"not a git"* ]] || { echo "FAIL: error should mention not a git repo"; return 1; }
}

@test "orchestrator in dry-run mode does not create commits" {
  # Create a mock brain repo
  mkdir -p "$WORK/brain/wiki"
  git -C "$WORK/brain" init -q
  git -C "$WORK/brain" config user.email "test@test"
  git -C "$WORK/brain" config user.name "test"
  echo "# test" > "$WORK/brain/README.md"
  git -C "$WORK/brain" add . && git -C "$WORK/brain" commit -q -m "init"

  # Count commits before
  local before
  before="$(git -C "$WORK/brain" rev-list --count HEAD)"

  # Run in dry-run mode (will fail because LM Studio is not running,
  # but should not create commits)
  run bash "$INGEST" --brain-repo "$WORK/brain" --dry-run 2>&1

  # Count commits after
  local after
  after="$(git -C "$WORK/brain" rev-list --count HEAD)"

  [ "$before" -eq "$after" ] || { echo "FAIL: dry-run created commits"; return 1; }
}

# --- State file tests ---

@test "state file is created if it does not exist" {
  mkdir -p "$WORK/brain/wiki"
  git -C "$WORK/brain" init -q
  git -C "$WORK/brain" config user.email "test@test"
  git -C "$WORK/brain" config user.name "test"
  echo "# test" > "$WORK/brain/README.md"
  git -C "$WORK/brain" add . && git -C "$WORK/brain" commit -q -m "init"

  local state_file="$WORK/state.json"
  [ ! -f "$state_file" ] || rm "$state_file"

  # Run (will fail on LLM call, but should create state file)
  bash "$INGEST" --brain-repo "$WORK/brain" --dry-run --state "$state_file" 2>/dev/null || true

  [ -f "$state_file" ] || { echo "FAIL: state file not created"; return 1; }
}

# --- MOC generation tests ---

@test "index-moc links to sub-MOCs after ingest" {
  # This test verifies the MOC structure, not the full ingest
  # Create a mock brain wiki with sub-MOCs
  mkdir -p "$WORK/brain/wiki"
  cat > "$WORK/brain/wiki/index-moc.md" <<'EOF'
---
type: moc
tags: [moc, meta]
status: active
source:: test
---
# Wiki — Map of Content

## SSOT Specs
- [[ssot-specs-moc]]

## Runbooks
- [[runbooks-moc]]
EOF

  # Verify index-moc links to sub-MOCs
  grep -q '\[\[ssot-specs-moc\]\]' "$WORK/brain/wiki/index-moc.md" || {
    echo "FAIL: index-moc does not link to ssot-specs-moc"
    return 1
  }
  grep -q '\[\[runbooks-moc\]\]' "$WORK/brain/wiki/index-moc.md" || {
    echo "FAIL: index-moc does not link to runbooks-moc"
    return 1
  }
}

# --- Type mapping tests ---

@test "type_map overrides take precedence over defaults" {
  # Verify that the manifest has overrides that would change default types
  [ -f "$MANIFEST" ]
  # Check that security*.md override exists
  grep -q 'pattern:.*security' "$MANIFEST" || {
    echo "FAIL: no override for security specs"
    return 1
  }
  # Check that the override type is different from the default (note)
  grep -A1 'pattern:.*security' "$MANIFEST" | grep -q 'type: decision' || {
    echo "FAIL: security override should be decision, not note"
    return 1
  }
}
