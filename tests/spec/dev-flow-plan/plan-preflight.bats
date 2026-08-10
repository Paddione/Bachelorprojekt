# Pruefmodus: Output-Verifikation (run + $status/$output) [T002448-M4]
# Tests für scripts/plan-preflight.sh — fail-closed Guard-Skript.
# Verwendet Temp-Git-Fixtures, AGENT_LOCK_DIR-Override belässt die
# echte Lock-Registry der Session unberührt.

setup() {
  TEST_DIR="$BATS_TEST_TMPDIR/preflight-test"
  rm -rf "$TEST_DIR"
  mkdir -p "$TEST_DIR"

  # Lock-Verzeichnis AUSSERHALB des Repos — sonst machen Lock-Dateien
  # das Working-Tree dirty und der Clean-Tree-Guard triggert falsch.
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/agent-locks"
  mkdir -p "$AGENT_LOCK_DIR"

  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" init -b main >/dev/null 2>&1
  echo "initial" > "$TEST_DIR/initial.txt"
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" add initial.txt \
    && GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" commit -q -m "initial commit" >/dev/null

  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" checkout -q -b feature/px-T009999 >/dev/null 2>&1

  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/plan-preflight.sh"
}

@test "Usage-Fehler: fehlendes --ticket → rc=2" {
  cd "$TEST_DIR"
  run bash "$SCRIPT" pre-commit
  [ "$status" -eq 2 ]
}

@test "Usage-Fehler: unbekanntes Subkommando → rc=2" {
  cd "$TEST_DIR"
  run bash "$SCRIPT" invalid-cmd --ticket T009999
  [ "$status" -eq 2 ]
}

@test "pre-commit auf main wird abgelehnt (rc=1)" {
  cd "$TEST_DIR"
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" checkout -q main >/dev/null 2>&1
  run bash "$SCRIPT" pre-commit --ticket T009999
  [ "$status" -eq 1 ]
  grep -qF "main" <<<"$output"

  # Positiv-Anker: mit Feature-Branch + validem Lock → rc=0
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" checkout -q feature/px-T009999 >/dev/null 2>&1
  echo '{"branch":"feature/px-T009999"}' > "$AGENT_LOCK_DIR/ticket__T009999.json"

  run bash "$SCRIPT" pre-commit --ticket T009999
  [ "$status" -eq 0 ]
}

@test "pre-commit mit dirty tree wird abgelehnt (rc=1)" {
  cd "$TEST_DIR"
  echo '{"branch":"feature/px-T009999"}' > "$AGENT_LOCK_DIR/ticket__T009999.json"
  echo "dirty" > "$TEST_DIR/dirty.txt"

  run bash "$SCRIPT" pre-commit --ticket T009999
  [ "$status" -eq 1 ]
  grep -qF "nicht sauber" <<<"$output"

  # Positiv-Anker: nach commit → rc=0
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" add dirty.txt && GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" commit -q -m "clean" >/dev/null
  run bash "$SCRIPT" pre-commit --ticket T009999
  [ "$status" -eq 0 ]
}

@test "pre-commit ohne Lock wird abgelehnt (rc=1)" {
  cd "$TEST_DIR"
  run bash "$SCRIPT" pre-commit --ticket T009999
  [ "$status" -eq 1 ]
  grep -qF "ticket__" <<<"$output"
  grep -qF "branch__" <<<"$output"
}

@test "pre-commit akzeptiert ticket-scoped Lock mit Branch-Match (rc=0)" {
  cd "$TEST_DIR"
  echo '{"branch":"feature/px-T009999"}' > "$AGENT_LOCK_DIR/ticket__T009999.json"
  run bash "$SCRIPT" pre-commit --ticket T009999
  [ "$status" -eq 0 ]
}

@test "pre-commit akzeptiert branch-scoped Fallback (rc=0) [T003102]" {
  cd "$TEST_DIR"
  echo '{"branch":"feature/px-T009999"}' > "$AGENT_LOCK_DIR/branch__feature-px-T009999.json"
  run bash "$SCRIPT" pre-commit --ticket T009999
  [ "$status" -eq 0 ]
  grep -qF "branch__" <<<"$output"
}

@test "pre-commit mit Branch-Mismatch im Lock wird abgelehnt (rc=1)" {
  cd "$TEST_DIR"
  echo '{"branch":"feature/andere-T009998"}' > "$AGENT_LOCK_DIR/ticket__T009999.json"
  run bash "$SCRIPT" pre-commit --ticket T009999
  [ "$status" -eq 1 ]
  grep -qF "Mismatch" <<<"$output"

  # Positiv-Anker: korrigierter Lock → rc=0
  echo '{"branch":"feature/px-T009999"}' > "$AGENT_LOCK_DIR/ticket__T009999.json"
  run bash "$SCRIPT" pre-commit --ticket T009999
  [ "$status" -eq 0 ]
}

@test "pre-worktree: nicht gemergtes Ticket → rc=0" {
  cd "$TEST_DIR"
  # Temp bare repo als origin simulieren
  local bare="$TEST_DIR/origin.git"
  git init --bare "$bare" >/dev/null 2>&1
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" remote add origin "$bare" >/dev/null 2>&1
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" push -q origin main >/dev/null 2>&1

  run bash "$SCRIPT" pre-worktree --ticket T009999
  [ "$status" -eq 0 ]
}

@test "pre-worktree: kein origin/main → rc != 0 und rc != 1" {
  cd "$TEST_DIR"
  # Kein Remote gesetzt → Umgebungsfehler (rc 2)
  run bash "$SCRIPT" pre-worktree --ticket T009999
  [ "$status" -ne 0 ]
  [ "$status" -ne 1 ]
}
