#!/usr/bin/env bats
# Tests: plan-frontmatter-hook.sh setzt Batch-Felder wenn sie fehlen

setup() {
  TMPDIR="$(mktemp -d)"
  HOOK="$BATS_TEST_DIRNAME/../../scripts/plan-frontmatter-hook.sh"
}

teardown() { rm -rf "$TMPDIR"; }

@test "Case A: neues Frontmatter bekommt Batch-Felder" {
  local f="$TMPDIR/plan.md"
  echo "# Mein Plan" > "$f"
  echo "Inhalt des Plans." >> "$f"
  CI=1 bash "$HOOK" "$f"
  grep -q "file_locks: \[\]"       "$f"
  grep -q "shared_changes: false"  "$f"
  grep -q "batch_id: null"         "$f"
  grep -q "parent_feature: null"   "$f"
  grep -q "depends_on_plans: \[\]" "$f"
}

@test "Case C: unvollstaendiges Frontmatter bekommt fehlende Batch-Felder" {
  local f="$TMPDIR/plan.md"
  printf '%s\n' "---" "title: Test" "ticket_id: null" "status: active" "pr_number: null" "---" "# Body" > "$f"
  CI=1 bash "$HOOK" "$f"
  grep -q "file_locks: \[\]"       "$f"
  grep -q "shared_changes: false"  "$f"
}

@test "Case B: vollstaendiges Frontmatter mit Batch-Feldern bleibt unveraendert" {
  local f="$TMPDIR/plan.md"
  printf '%s\n' \
    "---" "title: T" "ticket_id: null" "domains: [website]" "status: active" "pr_number: null" \
    "file_locks: [website/src/foo.svelte]" "shared_changes: true" "batch_id: batch-abc" \
    "parent_feature: null" "depends_on_plans: []" "---" "# Body" > "$f"
  CI=1 bash "$HOOK" "$f"
  grep -q "file_locks: \[website/src/foo.svelte\]" "$f"
  grep -q "shared_changes: true" "$f"
  grep -q "batch_id: batch-abc"  "$f"
}

@test "Idempotent: zweimaliger Aufruf veraendert Datei nicht" {
  local f="$TMPDIR/plan.md"
  echo "# Plan" > "$f"
  CI=1 bash "$HOOK" "$f"
  local hash1; hash1=$(md5sum "$f")
  CI=1 bash "$HOOK" "$f"
  local hash2; hash2=$(md5sum "$f")
  [[ "$hash1" == "$hash2" ]]
}
