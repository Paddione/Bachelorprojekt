#!/usr/bin/env bats
# Tests for scripts/brain-ingest-restamp.sh (T900401): frontmatter-only
# refresh for chunk-identical pages, refuse on changed chunks.

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/brain-ingest-restamp.sh"
CHUNKER="$BATS_TEST_DIRNAME/../../scripts/brain-chunk.sh"

setup() {
  TESTDIR="$(mktemp -d)"
  mkdir -p "$TESTDIR/root/docs/runbooks" "$TESTDIR/brain/wiki"
  printf -- '# Fixture\n\nBody text stays.\n' > "$TESTDIR/root/docs/runbooks/fixture.md"
  printf -- '# Other\n\nChanged later.\n' > "$TESTDIR/root/docs/runbooks/other.md"
  # Real chunk hash for the matching entry (robust to chunker internals).
  rm -rf "$TESTDIR/chunks"
  ts="$(bash "$CHUNKER" --source "$TESTDIR/root/docs/runbooks/fixture.md" \
    --slug docs-runbooks-fixture --out-dir "$TESTDIR/chunks" 2>/dev/null)"
  chunk_file="$(printf '%s\n' "$ts" | awk -F'\t' '$3 == 1 {print $1; exit}')"
  chunk_hash="$(sha256sum "$chunk_file" | cut -d' ' -f1)"
  cat > "$TESTDIR/state.json" <<EOF
{
  "docs/runbooks/fixture.md#1": {"hash": "$chunk_hash", "slug": "docs-runbooks-fixture-001", "type": "note", "group": "runbooks", "chunk_index": "1"},
  "docs/runbooks/other.md#1": {"hash": "0000000000000000000000000000000000000000000000000000000000000000", "slug": "docs-runbooks-other-001", "type": "note", "group": "runbooks", "chunk_index": "1"}
}
EOF
  printf -- '---\ntype: note\ntags: [note]\nstatus: active\n---\n\n# Fixture\n\nBody text stays.\n\nsource:: Bachelorprojekt docs/runbooks/fixture.md\n' > "$TESTDIR/brain/wiki/docs-runbooks-fixture-001.md"
  printf -- '---\ntype: note\ntags: [note]\nstatus: active\n---\n\n# Other\n\nChanged later.\n\nsource:: Bachelorprojekt docs/runbooks/other.md\n' > "$TESTDIR/brain/wiki/docs-runbooks-other-001.md"
  printf -- '---\ntype: moc\ntags: [index, meta]\nstatus: active\n---\n\n# Meta\n\nsource:: brain-foundation (self)\n' > "$TESTDIR/brain/wiki/meta.md"
  cp "$TESTDIR/brain/wiki/docs-runbooks-fixture-001.md" "$TESTDIR/fixture-before.md"
  cp "$TESTDIR/brain/wiki/docs-runbooks-other-001.md" "$TESTDIR/other-before.md"
}

teardown() {
  rm -rf "$TESTDIR"
}

page_body() {
  awk '/^---$/{n++; if (n==2) {body=1; next}} body' "$1"
}

@test "dry run lists candidate and retransform-need, writes nothing" {
  run bash "$SCRIPT" --brain-repo "$TESTDIR/brain" --root "$TESTDIR/root" \
    --state "$TESTDIR/state.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"STAMP-CANDIDATE: wiki/docs-runbooks-fixture-001.md"* ]]
  [[ "$output" == *"NEEDS-RETRANSFORM: wiki/docs-runbooks-other-001.md"* ]]
  [[ "$output" != *"wiki/meta.md"* ]]
  run cmp -s "$TESTDIR/brain/wiki/docs-runbooks-fixture-001.md" "$TESTDIR/fixture-before.md"
  [ "$status" -eq 0 ]
}

@test "apply stamps lifecycle fields, keeps body byte-identical" {
  run bash "$SCRIPT" --brain-repo "$TESTDIR/brain" --root "$TESTDIR/root" \
    --state "$TESTDIR/state.json" --apply
  [ "$status" -eq 0 ]
  [[ "$output" == *"STAMPED: wiki/docs-runbooks-fixture-001.md"* ]]
  page="$TESTDIR/brain/wiki/docs-runbooks-fixture-001.md"
  run grep -q '^source_kind: "runbook"$' "$page"
  [ "$status" -eq 0 ]
  run grep -q '^source_revision: "[0-9a-f]\{64\}"$' "$page"
  [ "$status" -eq 0 ]
  run grep -q '^observed_at: ' "$page"
  [ "$status" -eq 0 ]
  run grep -q '^valid_from: ' "$page"
  [ "$status" -eq 0 ]
  run cmp -s <(page_body "$page") <(page_body "$TESTDIR/fixture-before.md")
  [ "$status" -eq 0 ]
}

@test "apply leaves changed-chunk page untouched" {
  run bash "$SCRIPT" --brain-repo "$TESTDIR/brain" --root "$TESTDIR/root" \
    --state "$TESTDIR/state.json" --apply
  [ "$status" -eq 0 ]
  run cmp -s "$TESTDIR/brain/wiki/docs-runbooks-other-001.md" "$TESTDIR/other-before.md"
  [ "$status" -eq 0 ]
}
