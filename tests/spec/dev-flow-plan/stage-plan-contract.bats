# Pruefmodus: Output-Verifikation (run + $status/$output) [T002448-M4]
# Vertragstests für stage-plan — nur Parsing-/Flag-Fehler vor DB-Zugriff.
# CI hat keine Ticket-DB: diese Datei misst ausschliesslich Fehler, die
# stage-plan.sh VOR dem ersten _pgpod-Aufruf produziert (Flag-Prüfung, git cat-file).
# End-to-end-Härtung (touched_files-UNION) bleibt bewusst ungetestet in CI —
# der Guard ist der Exit-1-Pfad, der ohne DB reproduzierbar ist, solange die
# Ableitung VOR dem ersten Write liegt (P2.2-Invariante).

setup() {

  TEST_DIR="$BATS_TEST_TMPDIR/stage-test"
  rm -rf "$TEST_DIR"
  mkdir -p "$TEST_DIR"

  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" init -b main >/dev/null 2>&1

  echo "# Test plan" > "$TEST_DIR/test-plan.md"
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" add test-plan.md \
    && GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" commit -q -m "add plan" >/dev/null

  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  STAGE="$REPO_ROOT/scripts/ticket.sh stage-plan"
}

@test "ohne --hold/--no-hold → rc=1, Meldung nennt beide Flags" {
  run bash -c "cd '$REPO_ROOT' && $STAGE --id T009999 --branch main --plan test-plan.md --partials 1"
  [ "$status" -eq 1 ]
  grep -qF -- '--hold' <<<"$output"
  grep -qF -- '--no-hold' <<<"$output"
}

@test "--partials 0 → rc=2" {
  run bash -c "cd '$REPO_ROOT' && $STAGE --id T009999 --branch main --plan test-plan.md --partials 0 --no-hold"
  [ "$status" -eq 2 ]
}

@test "unbekanntes Flag → rc=2, Usage nennt --no-hold und --allow-empty-touched" {
  run bash -c "cd '$REPO_ROOT' && $STAGE --id T009999 --branch main --plan test-plan.md --partials 1 --xyz"
  [ "$status" -eq 2 ]
  grep -qF -- '--no-hold' <<<"$output"
  grep -qF -- '--allow-empty-touched' <<<"$output"
}

@test "Plan nicht committed → rc=1 (vor der DB)" {
  run bash -c "cd '$REPO_ROOT' && $STAGE --id T009999 --branch main --plan nonexistent.md --partials 1 --no-hold"
  [ "$status" -eq 1 ]
}
