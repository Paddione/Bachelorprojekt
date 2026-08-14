#!/usr/bin/env bats
#
# SSOT: openspec/specs/dev-flow-plan.md (worktree-Lifecycle, T000510 Session-Koordination)
# Ticket: T005115 — Fremde Cleanups entfernten den Rollup-Worktree mitten im Lauf;
# der einzige dokumentierte Fremd-Remove-Pfad (dev-flow-plan Schritt −1) prüfte
# keine agent-lock-Claims. Fix: worktree-clean-check.sh lehnt Worktrees mit
# aktivem branch-Claim ab (rc 1), und der Skill-Text verweist darauf.
#
# PRUEFMODUS (T002448-M4): Command-Output-Verifikation fuer das Skript (Fixture:
# Temp-Git + AGENT_LOCK_DIR-Override). Der Skill-Text-Anteil ist ein
# Querschnitts-Test (Ergebnis manifestiert sich ausschliesslich im Dokument —
# die dokumentierte Ausnahme-Klasse) und als solcher im Test markiert.

setup() {
  TEST_DIR="$BATS_TEST_TMPDIR/claim-guard-test"
  rm -rf "$TEST_DIR"
  mkdir -p "$TEST_DIR"
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/agent-locks-claim-guard"
  mkdir -p "$AGENT_LOCK_DIR"

  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" init -b main >/dev/null 2>&1
  echo "x" > "$TEST_DIR/x.txt"
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" add x.txt
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" commit -q -m init >/dev/null
  GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@test" \
    GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@test" \
    git -C "$TEST_DIR" checkout -q -b feature/wt-T009888 >/dev/null 2>&1

  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/worktree-clean-check.sh"
}

@test "T005115: worktree-clean-check lehnt Worktree mit aktivem Fremd-Claim ab" {
  cd "$TEST_DIR"

  # Positiv-Anker: ohne Claim ist der Worktree sauber (rc=0).
  run bash "$SCRIPT" "$TEST_DIR"
  [ "$status" -eq 0 ]

  # Fremder, lebender branch-Claim (owner_sid fremd, heartbeat frisch) → rc=1.
  now=$(date +%s)
  cat > "$AGENT_LOCK_DIR/branch__feature-wt-T009888.json" <<EOF
{"scope":"branch","id":"feature/wt-T009888","owner_sid":"fremde-session-123","owner_pid":999999,"tool":"claude","label":"dev-flow-plan","worktree":"$TEST_DIR","branch":"feature/wt-T009888","ticket":"","host":"other","created_at":$now,"heartbeat_at":$now}
EOF

  run bash "$SCRIPT" "$TEST_DIR"
  [ "$status" -eq 1 ]
  grep -qiF "claim" <<<"$output"

  # Querschnitts-Test (Ausnahme-Klasse): der Skill-Text nennt den Claim-Guard
  # vor dem Fremd-Remove — ohne ihn haette der Befund keine wirksame Anweisung.
  skill="$REPO_ROOT/.claude/skills/dev-flow-plan/SKILL.md"
  [ "$(grep -c "worktree-clean-check.sh" "$skill")" -ge 1 ]
  [ "$(grep -c "check branch" "$skill")" -ge 1 ]
}
