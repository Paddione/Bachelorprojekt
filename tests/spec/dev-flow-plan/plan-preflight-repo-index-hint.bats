#!/usr/bin/env bats
# Pruefmodus: Output-Verifikation (run + $status/$output) [T002448-M4]
# T013678-Mishap #6: freshness:regenerate erzeugt docs/code-quality/repo-index.json,
# plan-preflight lehnt genau diese Datei als Fremd-Datei ab — die Meldung muss die
# Abhilfe (git restore der regenerierten Nicht-Freshness-Artefakte) nennen,
# damit der Guard-Ausschlag nicht als Defekt gelesen wird.

setup() {
  TEST_DIR="$BATS_TEST_TMPDIR/preflight-repo-index"
  rm -rf "$TEST_DIR"
  mkdir -p "$TEST_DIR"

  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/agent-locks"
  mkdir -p "$AGENT_LOCK_DIR"

  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" init -b main >/dev/null 2>&1
  echo "initial" > "$TEST_DIR/initial.txt"
  git -C "$TEST_DIR" add initial.txt
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" commit -q -m "initial commit" >/dev/null
  git -C "$TEST_DIR" checkout -q -b feature/px-T009999 >/dev/null 2>&1

  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/plan-preflight.sh"
}

@test "repo-index.json als Fremd-Datei: Meldung nennt git restore als Abhilfe" {
  cd "$TEST_DIR"
  mkdir -p docs/code-quality
  echo '{"file_count":1}' > docs/code-quality/repo-index.json
  git add docs/code-quality/repo-index.json

  run bash "$SCRIPT" pre-commit --ticket T009999
  # Positiv-Anker zuerst: der Guard erkennt die Fremd-Datei und schlaegt fehl.
  [ "$status" -eq 1 ]
  grep -qF "Fremd-Datei im Staged-Set" <<<"$output"
  # Die Abhilfe benennt die konkrete Datei — kein Raetseln, ob ein Guard-Defekt vorliegt.
  [[ "$output" == *"git restore docs/code-quality/repo-index.json"* ]]
}
