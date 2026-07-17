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

# --- T001884: single-file SRC + workflow path parity (E6) ---

@test "merge-hook copies a single-file SRC directly to DEST/<basename>" {
  echo "goal content" > "$WORK/source/single.md"
  run bash "$HOOK" "$WORK/source/single.md" "$WORK/target/raw"
  [ "$status" -eq 0 ]
  [ -f "$WORK/target/raw/single.md" ] || { echo "FAIL: single-file SRC not copied to DEST/<basename>"; return 1; }
}

@test "brain-merge-hook.yml triggers on and processes docs/adr/**" {
  wf="$REPO_ROOT/.github/workflows/brain-merge-hook.yml"
  grep -q 'docs/adr/\*\*' "$wf"
  grep -q 'bachelorprojekt/docs/adr brain/raw/adr' "$wf" \
    || { echo "FAIL: ADR handler step missing despite declared trigger"; return 1; }
}

@test "brain-merge-hook.yml triggers on and processes .claude/lib/goals.md, docs/diagrams/**, docs/db-schema-diagram.md" {
  wf="$REPO_ROOT/.github/workflows/brain-merge-hook.yml"
  grep -q '\.claude/lib/goals\.md' "$wf"
  grep -q 'docs/diagrams/\*\*' "$wf"
  grep -q 'docs/db-schema-diagram\.md' "$wf"
  grep -q 'bachelorprojekt/\.claude/lib/goals\.md brain/raw/goals' "$wf" \
    || { echo "FAIL: goals.md handler step missing"; return 1; }
  grep -q 'bachelorprojekt/docs/diagrams brain/raw/diagrams' "$wf" \
    || { echo "FAIL: docs/diagrams handler step missing"; return 1; }
}
