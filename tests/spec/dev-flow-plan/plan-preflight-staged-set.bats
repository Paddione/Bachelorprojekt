#!/usr/bin/env bats
#
# SSOT: openspec/specs/dev-flow-plan.md (stage-plan-Guards) + docs/agent-guide/registry/plan-guards.yaml
# Ticket: T005114 — plan-preflight pre-commit verlangt einen komplett leeren
# Working-Tree; mit gestagten Plan-Artefakten (der Zustand unmittelbar vor dem
# plan-stage-Commit) kann der Guard in der Skill-Reihenfolge nie grün werden.
# Fix: der Guard prüft das STAGED-Set (nur Plan-Artefakte) statt des gesamten
# Working-Trees; unstaged/ungetrackte Dateien bleiben für den Commit irrelevant.
#
# PRUEFMODUS (T002448-M4): Command-Output-Verifikation — Temp-Git-Fixture wie
# tests/spec/dev-flow-plan/plan-preflight.bats, AGENT_LOCK_DIR-Override.
#
# Positiv-Anker-Pflicht (T002356-M1): erst der gültige Fall (staged nur
# Plan-Artefakte → rc=0), dann der Negativ-Fall (staged Fremd-Datei → rc=1).

setup() {
  TEST_DIR="$BATS_TEST_TMPDIR/preflight-staged-test"
  rm -rf "$TEST_DIR"
  mkdir -p "$TEST_DIR"

  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/agent-locks-staged"
  mkdir -p "$AGENT_LOCK_DIR"

  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" init -b main >/dev/null 2>&1
  echo "initial" > "$TEST_DIR/initial.txt"
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" add initial.txt
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" commit -q -m "initial commit" >/dev/null
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" checkout -q -b feature/px-T009999 >/dev/null 2>&1

  echo '{"branch":"feature/px-T009999"}' > "$AGENT_LOCK_DIR/ticket__T009999.json"

  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/plan-preflight.sh"
}

@test "T005114: pre-commit akzeptiert gestagte Plan-Artefakte und lehnt gestagte Fremd-Dateien ab" {
  cd "$TEST_DIR"

  # Gültiger Fall: staged nur Plan-Artefakte — der Guard darf NICHT am
  # Clean-Tree-Zwang scheitern (das ist der Zustand direkt vor dem plan-stage-Commit).
  mkdir -p openspec/changes/xyz tests/spec/xyz
  echo "plan" > openspec/changes/xyz/tasks.md
  echo "test" > tests/spec/xyz/example.bats
  git add openspec/changes/xyz/tasks.md tests/spec/xyz/example.bats

  run bash "$SCRIPT" pre-commit --ticket T009999
  [ "$status" -eq 0 ]

  # Negativ-Fall (Positiv-Anker zuvor erbracht): eine gestagte Fremd-Datei
  # ausserhalb der Plan-Artefakte wird weiterhin abgelehnt.
  echo "fremd" > src-fremd.txt
  git add src-fremd.txt

  run bash "$SCRIPT" pre-commit --ticket T009999
  [ "$status" -eq 1 ]
  grep -qF "Fremd" <<<"$output" || grep -qF "fremd" <<<"$output"

  # Unstaged/untracked allein ist irrelevant für den Commit und lehnt nicht ab.
  git reset -q src-fremd.txt
  echo "unrelated" > unrelated.txt

  run bash "$SCRIPT" pre-commit --ticket T009999
  [ "$status" -eq 0 ]
}
