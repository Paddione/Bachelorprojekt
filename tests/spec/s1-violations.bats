#!/usr/bin/env bats
# SSOT: openspec/changes/s1-violations-batch1/proposal.md
# G-RH01: S1-Frozen-Violations ≤ 30 Einträge.
# Counts only S1-prefixed keys (file-size violations). S2/S3/S4 are
# independent gates tracked separately and not in scope for G-RH01.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-RH01: baseline.json S1-Einträge ≤ 30" {
  count=$(jq -r '[keys[] | select(startswith("S1:"))] | length' "$REPO_ROOT/docs/code-quality/baseline.json")
  [ "$count" -le 30 ]
}

@test "G-RH01: GLTFLoader.js ist aus S1-Gate ausgeschlossen" {
  ! grep -q "GLTFLoader" "$REPO_ROOT/docs/code-quality/gates.yaml" 2>/dev/null \
    || ! jq -e '."S1:brett/public/lib/GLTFLoader.js"' "$REPO_ROOT/docs/code-quality/baseline.json" >/dev/null 2>&1
}
