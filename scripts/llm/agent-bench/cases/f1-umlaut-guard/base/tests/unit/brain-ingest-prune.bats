#!/usr/bin/env bats
# Rekonstruktion des Vorzustands aus eb73acc515^ (T900395 / T002679).
# Tests for scripts/brain-ingest-prune.sh source:: matching
# (T002679 follow-up: transform emits "Rückverweis: Bachelorprojekt <path>",
# prune must parse it).
setup() {
  TESTDIR="$(mktemp -d)"
  mkdir -p "$TESTDIR/root" "$TESTDIR/brain/wiki"
  printf -- '# Live\n' > "$TESTDIR/root/live.md"
  printf 'live.md\tlive\tcore-docs\n' > "$TESTDIR/worklist.tsv"
  printf '{}' > "$TESTDIR/state.json"
}
teardown() { rm -rf "$TESTDIR"; }

@test "keeps page whose Rückverweis source exists, flags deleted one" {
  printf -- '---\ntype: note\n---\n\n# Keep\n\nsource:: Rückverweis: Bachelorprojekt live.md\n' > "$TESTDIR/brain/wiki/keep.md"
  printf -- '---\ntype: note\n---\n\n# Drop\n\nsource:: Rückverweis: Bachelorprojekt gone.md\n' > "$TESTDIR/brain/wiki/drop.md"
  run bash "$BATS_TEST_DIRNAME/../../scripts/brain-ingest-prune.sh" \
    --brain-repo "$TESTDIR/brain" --root "$TESTDIR/root" \
    --worklist "$TESTDIR/worklist.tsv" --state "$TESTDIR/state.json"
  [ "$status" -eq 0 ]
  [[ "$output" != *"wiki/keep.md"* ]]
  [[ "$output" == *"PRUNE-CANDIDATE: wiki/drop.md"* ]]
}

@test "legacy bare Bachelorprojekt path still parses" {
  printf -- '---\ntype: note\n---\n\n# Drop\n\nsource:: Bachelorprojekt gone.md\n' > "$TESTDIR/brain/wiki/drop.md"
  run bash "$BATS_TEST_DIRNAME/../../scripts/brain-ingest-prune.sh" \
    --brain-repo "$TESTDIR/brain" --root "$TESTDIR/root" \
    --worklist "$TESTDIR/worklist.tsv" --state "$TESTDIR/state.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PRUNE-CANDIDATE: wiki/drop.md"* ]]
}
