#!/usr/bin/env bats
<<<<<<< HEAD
# T001567: brain-auto-memory bridge — BATS Spec (RED first, GREEN after scripts land)
# SSOT: openspec/changes/brain-auto-memory/tasks.md

load 'test_helper'

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  SCAN="$REPO_ROOT/scripts/brain-auto-memory-scan.sh"
  EXPORT="$REPO_ROOT/scripts/brain-auto-memory-export.sh"
  WORK="$(mktemp -d)"
  export AUTO_MEMORY_ROOT="$WORK/projects"
  export AUTO_MEMORY_STATE="$WORK/state.json"
  export AUTO_MEMORY_CANDIDATES="$WORK/candidates.json"
  mkdir -p "$AUTO_MEMORY_ROOT/demoproj/memory"
}

teardown() { rm -rf "$WORK"; }

# a memory page with valid frontmatter (name/description/metadata.type)
_page() { # <project> <file> <type> [bodyline]
  local dir="$AUTO_MEMORY_ROOT/$1/memory"; mkdir -p "$dir"
  cat > "$dir/$2" <<EOF
---
name: $2
description: demo page $2
metadata:
  type: $3
---
${4:-just some prose body}
EOF
}

@test "scan reports a new memory page as candidate" {
  _page demoproj feedback_thing.md feedback
  run bash "$SCAN"
  [ "$status" -eq 0 ] || { echo "FAIL status=$status: $output"; return 1; }
  run jq -e '.[0].file == "feedback_thing.md" and .[0].metadata_type == "feedback"' "$AUTO_MEMORY_CANDIDATES"
  [ "$status" -eq 0 ] || { echo "FAIL: candidate not emitted: $(cat "$AUTO_MEMORY_CANDIDATES")"; return 1; }
}

@test "scan does not re-report an unchanged page" {
  _page demoproj note1.md project
  bash "$SCAN"
  # simulate an export having recorded the current hash into state
  local h; h="$(sha256sum "$AUTO_MEMORY_ROOT/demoproj/memory/note1.md" | cut -d' ' -f1)"
  jq -n --arg k "demoproj/note1.md" --arg h "$h" \
    '{($k): {hash: $h, last_export: "2026-07-04T00:00:00Z"}}' > "$AUTO_MEMORY_STATE"
  run bash "$SCAN"
  [ "$status" -eq 0 ] || { echo "FAIL status=$status"; return 1; }
  run jq -e 'length == 0' "$AUTO_MEMORY_CANDIDATES"
  [ "$status" -eq 0 ] || { echo "FAIL: unchanged page re-reported: $(cat "$AUTO_MEMORY_CANDIDATES")"; return 1; }
}

@test "scan skips a page without parsable frontmatter and warns" {
  printf 'no frontmatter here\njust text\n' > "$AUTO_MEMORY_ROOT/demoproj/memory/bare.md"
  run bash "$SCAN"
  [ "$status" -eq 0 ] || { echo "FAIL status=$status"; return 1; }
  [[ "$output" == *"bare.md"* ]] || { echo "FAIL: no warning for bare.md"; return 1; }
  run jq -e 'length == 0' "$AUTO_MEMORY_CANDIDATES"
  [ "$status" -eq 0 ] || { echo "FAIL: bare page became candidate"; return 1; }
}

@test "scan skips a page containing a secret pattern" {
  _page demoproj secret.md reference "-----BEGIN PRIVATE KEY-----"
  run bash "$SCAN"
  [ "$status" -eq 0 ] || { echo "FAIL status=$status"; return 1; }
  [[ "$output" == *"secret.md"* ]] || { echo "FAIL: no secret warning"; return 1; }
  run jq -e 'length == 0' "$AUTO_MEMORY_CANDIDATES"
  [ "$status" -eq 0 ] || { echo "FAIL: secret page became candidate"; return 1; }
}

@test "scan skips MEMORY.md index files" {
  _page demoproj MEMORY.md project
  run bash "$SCAN"
  [ "$status" -eq 0 ]
  run jq -e 'length == 0' "$AUTO_MEMORY_CANDIDATES"
  [ "$status" -eq 0 ] || { echo "FAIL: MEMORY.md became candidate"; return 1; }
}

@test "export maps feedback -> decision and writes converted page" {
  _page demoproj feedback_conv.md feedback
  local brain="$WORK/brain"; mkdir -p "$brain"
  git -C "$brain" init -q && git -C "$brain" config user.email t@t && git -C "$brain" config user.name t
  export BRAIN_REPO_PATH="$brain"
  # answer 'y' to the single candidate; stub push by pointing origin at a bare local repo
  git init -q --bare "$WORK/remote.git"
  git -C "$brain" remote add origin "$WORK/remote.git"
  printf 'y\n' > "$WORK/answers"; export AUTO_MEMORY_ASSUME="$WORK/answers"
  run bash "$EXPORT"
  [ "$status" -eq 0 ] || { echo "FAIL status=$status: $output"; return 1; }
  local out; out="$(find "$brain/raw/auto-memory/demoproj" -name '*.md' | head -1)"
  [ -n "$out" ] || { echo "FAIL: no page written"; return 1; }
  grep -q '^type: decision' "$out" || { echo "FAIL: type not decision: $(cat "$out")"; return 1; }
  grep -q 'auto-memory' "$out" || { echo "FAIL: missing auto-memory tag"; return 1; }
}

@test "export aborts when BRAIN_REPO_PATH is unset and leaves state untouched" {
  _page demoproj x.md project
  echo '{"pre":"existing"}' > "$AUTO_MEMORY_STATE"
  local before; before="$(cat "$AUTO_MEMORY_STATE")"
  unset BRAIN_REPO_PATH
  printf 'y\n' > "$WORK/answers"; export AUTO_MEMORY_ASSUME="$WORK/answers"
  run bash "$EXPORT"
  [ "$status" -ne 0 ] || { echo "FAIL: export did not abort"; return 1; }
  [ "$(cat "$AUTO_MEMORY_STATE")" = "$before" ] || { echo "FAIL: state mutated on abort"; return 1; }
}

@test "export updates state only for approved (y), not rejected (n)" {
  _page demoproj keep.md project
  _page demoproj drop.md project
  local brain="$WORK/brain"; mkdir -p "$brain"
  git -C "$brain" init -q && git -C "$brain" config user.email t@t && git -C "$brain" config user.name t
  git init -q --bare "$WORK/remote.git"; git -C "$brain" remote add origin "$WORK/remote.git"
  export BRAIN_REPO_PATH="$brain"
  printf 'y\nn\n' > "$WORK/answers"; export AUTO_MEMORY_ASSUME="$WORK/answers"
  run bash "$EXPORT"
  [ "$status" -eq 0 ] || { echo "FAIL status=$status: $output"; return 1; }
  # exactly one of the two pages recorded in state (the approved one)
  run jq -e '[to_entries[] | select(.key | startswith("demoproj/"))] | length == 1' "$AUTO_MEMORY_STATE"
  [ "$status" -eq 0 ] || { echo "FAIL: state count wrong: $(cat "$AUTO_MEMORY_STATE")"; return 1; }
}
=======
# T001567: brain-auto-memory bridge — BATS Spec (placeholder)

load "test_helper"

setup() { skip "brain-auto-memory test suite - full implementation pending"; }
>>>>>>> origin/main
