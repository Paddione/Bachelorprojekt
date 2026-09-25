#!/usr/bin/env bats
# Tests for scripts/brain-ingest-moc.sh ghost guards + index template (T900400).

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/brain-ingest-moc.sh"
MANIFEST="$BATS_TEST_DIRNAME/../../scripts/brain/ingest-sources.yaml"
METADATA="$BATS_TEST_DIRNAME/../../scripts/brain-page-metadata.py"

setup() {
  TESTDIR="$(mktemp -d)"
  mkdir -p "$TESTDIR/root" "$TESTDIR/brain/wiki"
  : > "$TESTDIR/chunks.tsv"
  cat > "$TESTDIR/state.json" <<'EOF'
{
  "docs/runbooks/fixture-live.md#1": {"slug": "docs-runbooks-fixture-live-001", "type": "note", "group": "runbooks"},
  "docs/runbooks/fixture-ghost.md#1": {"slug": "docs-runbooks-fixture-ghost-001", "type": "note", "group": "runbooks"}
}
EOF
  printf -- '---\ntype: note\n---\n\n# Live\n' > "$TESTDIR/brain/wiki/docs-runbooks-fixture-live-001.md"
}

teardown() {
  rm -rf "$TESTDIR"
}

run_moc() {
  bash "$SCRIPT" --brain-repo "$TESTDIR/brain" --chunks "$TESTDIR/chunks.tsv" \
    --state "$TESTDIR/state.json" --source-root "$TESTDIR/root" --manifest "$MANIFEST" \
    --metadata-script "$METADATA" --observed-at "2026-09-25T21:00:00Z" --valid-from "2026-09-25"
}

@test "group MOC skips state slugs without delivered pages" {
  run run_moc
  [ "$status" -eq 0 ]
  run grep -qF '[[docs-runbooks-fixture-live-001]]' "$TESTDIR/brain/wiki/runbooks-moc.md"
  [ "$status" -eq 0 ]
  run grep -qF 'fixture-ghost' "$TESTDIR/brain/wiki/runbooks-moc.md"
  [ "$status" -ne 0 ]
}

@test "index template links no pruned pages, no ghosts, correct group slugs" {
  run run_moc
  [ "$status" -eq 0 ]
  local page="$TESTDIR/brain/index.md"
  [ -f "$page" ]
  for dead in quality-goals usage cheatsheet first-aid llm-workflows capabilities; do
    run grep -qF "[[$dead]]" "$page"
    [ "$status" -ne 0 ]
  done
  run grep -qF '[[gotchas-moc]]' "$page"
  [ "$status" -ne 0 ]
  run grep -qF '[[agent-guide-maps]]' "$page"
  [ "$status" -ne 0 ]
  run grep -qF '[[gotchas-footguns-moc]]' "$page"
  [ "$status" -eq 0 ]
  run grep -qF '[[agent-guide-maps-moc]]' "$page"
  [ "$status" -eq 0 ]
  run grep -qF '[[docs-runbooks-fixture-live-001]]' "$page"
  [ "$status" -eq 0 ]
  run grep -qF 'fixture-ghost' "$page"
  [ "$status" -ne 0 ]
}
