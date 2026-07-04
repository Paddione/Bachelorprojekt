#!/usr/bin/env bats
# tests/spec/brain-merge-hook.bats
# SSOT: openspec/changes/brain-llm-wiki/proposal.md (Change 4: brain-merge-hook)
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  HOOK="$REPO_ROOT/scripts/brain-merge-hook.sh"
  WORK="$(mktemp -d)"
  mkdir -p "$WORK/source" "$WORK/target/raw"
  echo "---\ntype: spec\ntitle: Test\n---\nbody" > "$WORK/source/test-spec.md"
}
teardown() { rm -rf "$WORK"; }

@test "merge-hook copies changed markdown files to raw/" {
  run bash "$HOOK" "$WORK/source" "$WORK/target/raw"
  [ "$status" -eq 0 ]
  [ -f "$WORK/target/raw/test-spec.md" ]
}

@test "merge-hook preserves directory structure" {
  mkdir -p "$WORK/source/sub"
  echo "nested" > "$WORK/source/sub/nested.md"
  run bash "$HOOK" "$WORK/source" "$WORK/target/raw"
  [ -f "$WORK/target/raw/sub/nested.md" ]
}

@test "merge-hook skips non-md files" {
  echo "binary" > "$WORK/source/data.bin"
  run bash "$HOOK" "$WORK/source" "$WORK/target/raw"
  [ ! -f "$WORK/target/raw/data.bin" ]
}

@test "merge-hook generates manifest" {
  run bash "$HOOK" "$WORK/source" "$WORK/target/raw"
  [ -f "$WORK/target/raw/.manifest.json" ]
}
