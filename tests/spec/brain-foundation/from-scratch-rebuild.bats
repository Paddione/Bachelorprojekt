#!/usr/bin/env bats
# Ticket: T012902 — Rebuild-Modus fuer brain-ingest

INGEST="$BATS_TEST_DIRNAME/../../../scripts/brain-ingest.sh"
HELPERS="$BATS_TEST_DIRNAME/../../../scripts/brain-ingest-reset.sh"
CHUNKER="$BATS_TEST_DIRNAME/../../../scripts/brain-chunk.sh"
REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"

setup() {
  BRAIN_DIR="$BATS_TEST_TMPDIR/brain"
  mkdir -p "$BRAIN_DIR/wiki"
  git -C "$BRAIN_DIR" init -q -b main
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"
  ORIGINAL_STATE='{"scripts/old.md":{"hash":"abc","slug":"old"}}'
  echo "$ORIGINAL_STATE" > "$STATE_FILE"

  printf '%s\n' 'source:: Bachelorprojekt scripts/brain-ingest.sh' > "$BRAIN_DIR/wiki/bp-page.md"
  printf '%s\n' 'source:: self' > "$BRAIN_DIR/wiki/meta-page.md"
  printf '%s\n' '# no source metadata' > "$BRAIN_DIR/wiki/no-source-page.md"
  printf '%s\n' 'source:: /srv/external/project/readme.md' > "$BRAIN_DIR/wiki/external-page.md"
}

run_reset() {
  run bash -c 'source "$1"; brain_ingest_reset_wiki "$2" "$3" "$4" "$5" "$5"' \
    _ "$HELPERS" "$BRAIN_DIR" "$STATE_FILE" "${1:-0}" "$REPO_ROOT"
}

@test "from-scratch deletes Bachelorprojekt pages and resets state" {
  run_reset
  [ "$status" -eq 0 ]
  [[ "$output" == *"=== Phase 1b:"* ]]
  [ ! -f "$BRAIN_DIR/wiki/bp-page.md" ]
  [ "$(cat "$STATE_FILE")" = '{}' ]
}

@test "from-scratch deletes a parent MOC carrying actual chunker absolute provenance" {
  MOC="$BRAIN_DIR/wiki/generated-parent-moc.md"
  run bash "$CHUNKER" \
    --source "$REPO_ROOT/openspec/specs/brain-foundation.md" \
    --slug generated-parent \
    --out-dir "$BATS_TEST_TMPDIR/chunks" \
    --moc "$MOC" \
    --target-chars 200
  [ "$status" -eq 0 ]
  grep -qF "source:: $REPO_ROOT/openspec/specs/brain-foundation.md" "$MOC"

  run_reset
  [ "$status" -eq 0 ]
  [ ! -f "$MOC" ]
}

@test "from-scratch preserves self, external, and no-source pages" {
  run_reset
  [ "$status" -eq 0 ]
  [ -f "$BRAIN_DIR/wiki/meta-page.md" ]
  [ -f "$BRAIN_DIR/wiki/external-page.md" ]
  [ -f "$BRAIN_DIR/wiki/no-source-page.md" ]
}

@test "from-scratch --pilot is rejected with exit 2 before writes" {
  export LM_MODEL="test-model"
  run bash "$INGEST" --brain-repo "$BRAIN_DIR" --from-scratch --pilot 5 \
    --state "$STATE_FILE"
  [ "$status" -eq 2 ]
  [[ "$output" == *"cannot be combined"* ]]
  [ -f "$BRAIN_DIR/wiki/bp-page.md" ]
  [ "$(cat "$STATE_FILE")" = "$ORIGINAL_STATE" ]
}

@test "from-scratch dry-run reports reset without modifying wiki or state" {
  export LM_MODEL="test-model"
  run bash "$INGEST" --brain-repo "$BRAIN_DIR" --from-scratch --dry-run \
    --state "$STATE_FILE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"would delete wiki/bp-page.md"* ]]
  [[ "$output" == *"would reset state file to {}"* ]]
  [ -f "$BRAIN_DIR/wiki/bp-page.md" ]
  [ -f "$BRAIN_DIR/wiki/meta-page.md" ]
  [ -f "$BRAIN_DIR/wiki/external-page.md" ]
  [ -f "$BRAIN_DIR/wiki/no-source-page.md" ]
  [ "$(cat "$STATE_FILE")" = "$ORIGINAL_STATE" ]
}

@test "from-scratch dry-run leaves invalid array state byte-identical" {
  export LM_MODEL="test-model"
  echo '[]' > "$STATE_FILE"

  run bash "$INGEST" --brain-repo "$BRAIN_DIR" --from-scratch --dry-run \
    --state "$STATE_FILE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"would repair non-object state file"* ]]
  [ "$(cat "$STATE_FILE")" = '[]' ]
}

@test "from-scratch dry-run does not create a missing state file" {
  export LM_MODEL="test-model"
  rm -f "$STATE_FILE"

  run bash "$INGEST" --brain-repo "$BRAIN_DIR" --from-scratch --dry-run \
    --state "$STATE_FILE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"would initialize missing state file"* ]]
  [ ! -e "$STATE_FILE" ]
}

@test "from-scratch dry-run works when invoked by absolute path outside a git repo" {
  export LM_MODEL="test-model"
  NON_REPO_CWD="$BATS_TEST_TMPDIR/non-repo-cwd"
  mkdir -p "$NON_REPO_CWD"

  run bash -c 'cd "$1"; exec bash "$2" --brain-repo "$3" --from-scratch --dry-run --state "$4"' \
    _ "$NON_REPO_CWD" "$INGEST" "$BRAIN_DIR" "$STATE_FILE"

  [ "$status" -eq 0 ]
  [[ "$output" == *"=== Phase 1b:"* ]]
  [ -f "$BRAIN_DIR/wiki/bp-page.md" ]
  [ "$(cat "$STATE_FILE")" = "$ORIGINAL_STATE" ]
}
