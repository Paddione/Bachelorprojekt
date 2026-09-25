#!/usr/bin/env bats
# Tests for scripts/brain-ingest-prune.sh source:: matching (T002679 follow-up:
# transform emits "Rückverweis: Bachelorprojekt <path>", prune must parse it).

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/brain-ingest-prune.sh"

setup() {
  TESTDIR="$(mktemp -d)"
  mkdir -p "$TESTDIR/root" "$TESTDIR/brain/wiki"
  echo "# live" > "$TESTDIR/root/live.md"
  printf 'live.md\tlive\tcore-docs\n' > "$TESTDIR/worklist.tsv"
  printf '{}\n' > "$TESTDIR/state.json"
}

teardown() {
  rm -rf "$TESTDIR"
}

@test "keeps page whose Rueckverweis source exists, flags deleted one" {
  printf -- '---\ntype: note\n---\n\n# Keep\n\nsource:: Rückverweis: Bachelorprojekt live.md\n' > "$TESTDIR/brain/wiki/keep.md"
  printf -- '---\ntype: note\n---\n\n# Drop\n\nsource:: Rückverweis: Bachelorprojekt gone.md\n' > "$TESTDIR/brain/wiki/drop.md"
  run bash "$SCRIPT" --brain-repo "$TESTDIR/brain" --root "$TESTDIR/root" \
    --worklist "$TESTDIR/worklist.tsv" --state "$TESTDIR/state.json"
  [ "$status" -eq 0 ]
  [[ "$output" != *"wiki/keep.md"* ]]
  [[ "$output" == *"PRUNE-CANDIDATE: wiki/drop.md"* ]]
}

@test "legacy bare Bachelorprojekt path still parses" {
  printf -- '---\ntype: note\n---\n\n# Legacy\n\nsource:: Bachelorprojekt live.md\n' > "$TESTDIR/brain/wiki/legacy.md"
  run bash "$SCRIPT" --brain-repo "$TESTDIR/brain" --root "$TESTDIR/root" \
    --worklist "$TESTDIR/worklist.tsv" --state "$TESTDIR/state.json"
  [ "$status" -eq 0 ]
  [[ "$output" != *"wiki/legacy.md"* ]]
}

@test "meta page with '<topic> (self)' source is never a candidate" {
  printf -- '---\ntype: moc\n---\n\n# Index\n\nsource:: brain-foundation (self)\n' > "$TESTDIR/brain/wiki/index-moc.md"
  run bash "$SCRIPT" --brain-repo "$TESTDIR/brain" --root "$TESTDIR/root" \
    --worklist "$TESTDIR/worklist.tsv" --state "$TESTDIR/state.json"
  [ "$status" -eq 0 ]
  [[ "$output" != *"wiki/index-moc.md"* ]]
}
