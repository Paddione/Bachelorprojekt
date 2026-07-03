#!/usr/bin/env bats
# T001570: brain-initial-ingest - BATS Spec (RED initial, GREEN after implementation)
# SSOT: openspec/changes/brain-initial-ingest/tasks.md

load 'test_helper'

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  WL="$REPO_ROOT/scripts/brain-ingest-worklist.sh"
  MANIFEST="$REPO_ROOT/scripts/brain/ingest-sources.yaml"
  WORK="$(mktemp -d)"
}

teardown() { rm -rf "$WORK"; }

# --- fixture helper: a tiny repo tree + a manifest the parser accepts ---
_fixture() {
  mkdir -p "$WORK/repo/sub" "$WORK/repo/drafts"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\na\n' > "$WORK/repo/a.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nb\n' > "$WORK/repo/sub/b.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nskip\n' > "$WORK/repo/drafts/skip.md"
  cat > "$WORK/manifest.yaml" <<YAML
exclude:
  - drafts/
groups:
  - group: notes
    priority: 1
    include:
      - "**/*.md"
YAML
}

@test "worklist emits TAB-separated source, slug, group rows" {
  _fixture
  
  if [ ! -f "$WL" ]; then
    echo "FAIL: scripts/brain-ingest-worklist.sh fehlt"
    return 1
  fi
  
  run bash "$WL" --root "$WORK/repo" --manifest "$WORK/manifest.yaml"
  [ "$status" -eq 0 ] || { echo "FAIL: worklist exited with $status"; return 1; }
  
  # Check for a.md and sub/b.md in output (tab-separated)
  [[ "$output" == *$'a.md'* ]] || { echo "FAIL: a.md nicht gefunden"; return 1; }
  [[ "$output" == *$'\t'* ]] || { echo "FAIL: Ausgabe ist nicht tab-getrennt"; return 1; }
}

@test "worklist derives collision-free kebab-case slug from the full path" {
  _fixture
  
  if [ ! -f "$WL" ]; then
    echo "FAIL: scripts/brain-ingest-worklist.sh fehlt"
    return 1
  fi
  
  run bash "$WL" --root "$WORK/repo" --manifest "$WORK/manifest.yaml"
  
  # sub/b.md -> sub-b (path segments joined, lowercased)
  [[ "$output" == *$'sub/b.md'* ]] || { echo "FAIL: sub/b.md nicht in Ausgabe"; return 1; }
}

@test "exclude globs suppress excluded sources from the worklist" {
  _fixture
  
  if [ ! -f "$WL" ]; then
    echo "FAIL: scripts/brain-ingest-worklist.sh fehlt"
    return 1
  fi
  
  run bash "$WL" --root "$WORK/repo" --manifest "$WORK/manifest.yaml"
  
  # drafts/skip.md sollte nicht in der Ausgabe sein
  [[ "$output" != *"drafts"* ]] || { echo "FAIL: exclude globs funktionieren nicht"; return 1; }
}

@test "real manifest declares the ssot-specs group and excludes archive paths" {
  if [ ! -f "$MANIFEST" ]; then
    echo "FAIL: scripts/brain/ingest-sources.yaml fehlt"
    return 1
  fi
  
  # Check for documented exclude prefixes
  grep -q 'docs/archive/' "$MANIFEST" || { echo "FAIL: docs/archive/ Exclude fehlt"; return 1; }
  grep -q 'docs/generated/' "$MANIFEST" || { echo "FAIL: docs/generated/ Exclude fehlt"; return 1; }
  grep -q 'openspec/specs/archive' "$MANIFEST" || { echo "FAIL: openspec/specs/archive Exclude fehlt"; return 1; }
  
  # Check for ssot-specs group
  grep -qE '(ssot-specs|SSOT)' "$MANIFEST" || { echo "FAIL: ssot-specs Gruppe fehlt"; return 1; }
}

@test "worklist errors when the manifest is missing" {
  run bash "$WL" --root "$WORK/repo" --manifest "/nonexistent.yaml"
  [ "$status" -ne 0 ] || { echo "FAIL: worklist sollte mit fehlendem Manifest fehlschlagen"; return 1; }
}
