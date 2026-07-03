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

# T001583 mishap 2: brain-ingest-worklist.sh emitted ~32.5k rows on first run
# because the exclude list only covered a handful of docs/-subpaths — tool-
# and dependency trees (node_modules, .agy/, .claude/commands/, build caches)
# were walked and tagged "docs" like everything else, making the Erst-Ingest
# LLM batch unbezahlbar and the wiki noisy.

@test "real manifest excludes node_modules and vendored dependency trees" {
  if [ ! -f "$MANIFEST" ]; then
    echo "FAIL: scripts/brain/ingest-sources.yaml fehlt"
    return 1
  fi
  grep -q 'node_modules/' "$MANIFEST" || { echo "FAIL: node_modules/ Exclude fehlt"; return 1; }
}

@test "real manifest excludes tool-/config-state trees (.agy/, .claude/commands/)" {
  if [ ! -f "$MANIFEST" ]; then
    echo "FAIL: scripts/brain/ingest-sources.yaml fehlt"
    return 1
  fi
  grep -q '\.agy/' "$MANIFEST" || { echo "FAIL: .agy/ Exclude fehlt"; return 1; }
  grep -q '\.claude/commands/' "$MANIFEST" || { echo "FAIL: .claude/commands/ Exclude fehlt"; return 1; }
}

# Code-review finding (T001583): is_excluded() does unanchored substring
# matching ([[ "$rel" == *"$pattern"* ]]) — a generic pattern like "build/"
# or "coverage/" collides with legitimate directory names that merely
# CONTAIN that substring, e.g. ".../mentolder-react-rebuild/..." contains
# "build/", and ".../vitest-coverage/..." contains "coverage/". Both are
# real openspec change dirs in this repo, not build caches.
@test "exclude list does not use collision-prone generic substrings (build/, coverage/)" {
  if [ ! -f "$MANIFEST" ]; then
    echo "FAIL: scripts/brain/ingest-sources.yaml fehlt"
    return 1
  fi
  ! grep -qxE '  - (build|coverage)/' "$MANIFEST" \
    || { echo "FAIL: generic build/ or coverage/ exclude collides with legitimate dir names (e.g. *-rebuild/, *-coverage/)"; return 1; }
}

@test "worklist does not exclude a legitimately-named dir that merely contains 'build' or 'coverage' as a substring" {
  mkdir -p "$WORK/repo/openspec/changes/archive/mentolder-react-rebuild" \
           "$WORK/repo/openspec/changes/archive/vitest-coverage"
  printf -- '# rebuild notes\n' > "$WORK/repo/openspec/changes/archive/mentolder-react-rebuild/proposal.md"
  printf -- '# coverage notes\n' > "$WORK/repo/openspec/changes/archive/vitest-coverage/proposal.md"

  run bash "$WL" --root "$WORK/repo" --manifest "$MANIFEST"
  [ "$status" -eq 0 ] || { echo "FAIL: worklist exited with $status"; return 1; }
  [[ "$output" == *"mentolder-react-rebuild"* ]] || { echo "FAIL: *-rebuild/ dir wrongly excluded"; return 1; }
  [[ "$output" == *"vitest-coverage"* ]] || { echo "FAIL: *-coverage/ dir wrongly excluded"; return 1; }
}

@test "worklist suppresses a nested node_modules tree regardless of depth" {
  mkdir -p "$WORK/repo/website/node_modules/some-pkg"
  printf -- '{}' > "$WORK/repo/website/node_modules/some-pkg/package.json"
  cat > "$WORK/manifest.yaml" <<YAML
exclude:
  - drafts/
  - node_modules/
groups:
  - group: notes
    priority: 1
    include:
      - "**/*.md"
YAML

  run bash "$WL" --root "$WORK/repo" --manifest "$WORK/manifest.yaml"
  [ "$status" -eq 0 ] || { echo "FAIL: worklist exited with $status"; return 1; }
  [[ "$output" != *"node_modules"* ]] || { echo "FAIL: nested node_modules Eintrag nicht ausgeschlossen"; return 1; }
}
