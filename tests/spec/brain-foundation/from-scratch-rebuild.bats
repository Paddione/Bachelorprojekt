#!/usr/bin/env bats
# tests/spec/brain-foundation/from-scratch-rebuild.bats
# Ticket: T012902 — Rebuild-Modus fuer brain-ingest
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Jeder Test
# fuehrt scripts/brain-ingest.sh mit --from-scratch aus und prueft Dateiinhalt
# bzw. Exit-Code — nicht den Quelltext des Skripts.
#
# Die Tests arbeiten gegen ein temporaeres brain-Repo-Verzeichnis, nicht gegen
# ~/brain. Negativtests bekommen je einen Positiv-Anker, damit ein stumm
# fehlschlagendes Skript den Test nicht gruen erscheinen laesst.

INGEST="$BATS_TEST_DIRNAME/../../../scripts/brain-ingest.sh"
setup() {
  # brain-ingest.sh requires LM_MODEL (T002533)
  export LM_MODEL="test-model"
  export BRAIN_INGEST_TEST_STOP_AFTER_RESET=1

  # Fake brain repo with a wiki/ directory and a few pages
  BRAIN_DIR="$BATS_TEST_TMPDIR/brain"
  mkdir -p "$BRAIN_DIR/wiki"
  git -C "$BRAIN_DIR" init -q -b main 2>/dev/null || true
  git -C "$BRAIN_DIR" config user.email "test@test" 2>/dev/null || true
  git -C "$BRAIN_DIR" config user.name "Test" 2>/dev/null || true
  echo "init" > "$BRAIN_DIR/.gitkeep"
  git -C "$BRAIN_DIR" add -A && git -C "$BRAIN_DIR" commit -q -m "init" 2>/dev/null || true

  # State file
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"
  ORIGINAL_STATE='{"scripts/old.md":{"hash":"abc","slug":"old"}}'
  echo "$ORIGINAL_STATE" > "$STATE_FILE"

  # A Bachelorprojekt page (has source:: Bachelorprojekt ...)
  cat > "$BRAIN_DIR/wiki/bp-page.md" <<'PAGE'
---
type: note
status: active
---

# Bachelorprojekt Page

source:: Bachelorprojekt scripts/brain-ingest.sh

This is a Bachelorprojekt page.
PAGE

  # A meta page (source:: self, no Bachelorprojekt prefix)
  cat > "$BRAIN_DIR/wiki/meta-page.md" <<'PAGE'
---
type: note
status: active
---

# Meta Page

source:: self

This is a meta page.
PAGE

  # A page without any source:: line
  cat > "$BRAIN_DIR/wiki/orphan-page.md" <<'PAGE'
---
type: note
status: active
---

# Orphan Page

This page has no source line.
PAGE

}

@test "from-scratch: Bachelorprojekt pages are deleted and state reset" {
  # Verify the page exists before
  [ -f "$BRAIN_DIR/wiki/bp-page.md" ]

  # Run with --from-scratch (not --dry-run) — bp-page should be deleted
  run bash "$INGEST" \
    --brain-repo "$BRAIN_DIR" \
    --from-scratch \
    --state "$STATE_FILE" \
    --branch test-branch

  [ "$status" -eq 0 ]
  [[ "$output" == *"=== Phase 1b:"* ]]

  # After --from-scratch, the Bachelorprojekt page must be gone
  [ ! -f "$BRAIN_DIR/wiki/bp-page.md" ]
  # State must be reset to empty
  [ "$(cat "$STATE_FILE")" = '{}' ]
}

@test "from-scratch: meta pages (source:: self) are never deleted" {
  [ -f "$BRAIN_DIR/wiki/meta-page.md" ]

  run bash "$INGEST" \
    --brain-repo "$BRAIN_DIR" \
    --from-scratch \
    --state "$STATE_FILE" \
    --branch test-branch

  [ "$status" -eq 0 ]
  [[ "$output" == *"=== Phase 1b:"* ]]
  # Meta page must survive
  [ -f "$BRAIN_DIR/wiki/meta-page.md" ]
  [ -f "$BRAIN_DIR/wiki/orphan-page.md" ]
  [ "$(cat "$STATE_FILE")" = '{}' ]
}

@test "from-scratch --pilot is rejected with exit 2" {
  run bash "$INGEST" \
    --brain-repo "$BRAIN_DIR" \
    --from-scratch \
    --pilot 5 \
    --dry-run \
    --state "$STATE_FILE" \
    --branch test-branch

  [ "$status" -eq 2 ]
  [[ "$output" == *"cannot be combined"* ]]
  # Pilot + from-scratch must not touch anything
  [ -f "$BRAIN_DIR/wiki/bp-page.md" ]
  [ -f "$BRAIN_DIR/wiki/meta-page.md" ]
  [ "$(cat "$STATE_FILE")" = "$ORIGINAL_STATE" ]
}

@test "from-scratch --dry-run reports but does not delete" {
  run bash "$INGEST" \
    --brain-repo "$BRAIN_DIR" \
    --from-scratch \
    --dry-run \
    --state "$STATE_FILE" \
    --branch test-branch

  [ "$status" -eq 0 ]
  [[ "$output" == *"DRY-RUN: would delete wiki/bp-page.md"* ]]
  [[ "$output" == *"DRY-RUN: would reset state file to {}"* ]]
  # All pages should still exist after dry-run
  [ -f "$BRAIN_DIR/wiki/bp-page.md" ]
  [ -f "$BRAIN_DIR/wiki/meta-page.md" ]
  [ -f "$BRAIN_DIR/wiki/orphan-page.md" ]
  [ "$(cat "$STATE_FILE")" = "$ORIGINAL_STATE" ]
}
