#!/usr/bin/env bats
# tests/spec/software-factory/pr-babysit.bats
# SSOT: openspec/specs/software-factory.md
#
# [T002503] Aufgeteilt aus tests/spec/software-factory.bats. Jene Sammeldatei hielt
# 495 der ~2300 Spec-Tests in einer Datei und war mit --no-parallelize-within-files
# unteilbar: sie bildete mit 115s den Boden jedes CI-Shards, in dem sie lag.
#
# Der Split ist ein VERSCHIEBEN, kein Kopieren — die Quelldatei ist entfernt.
# T002427/T002421: eine frueher zurueckgelassene Kopie erzeugte doppelte Testnamen,
# ein gefilterter Lauf sah gruen aus, waehrend `task test:factory` ueber die
# veraltete Fassung rot lief.
#
# Gemeinsame Variablen, _skip_if_no_db und Setup/Teardown liegen in _sf_common.bash.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

# ── T001805: PR-CI-Babysitter — gh-stub harness (pattern: tests/unit/vda-release-notes-smoke.bats) ──
# BIN_DIR/gh reads its canned responses from files under BIN_DIR so each
# _stub_gh_* helper can be composed independently; ARGV_LOG records every
# invocation ("$*") so tests can assert what babysit-prs.sh did/did-not call.
# GUARDS_REPO is also stubbed with a fake scripts/ticket.sh so
# guard_killswitch_on resolves offline (no live cluster) — same override
# pattern as the FA-SF-44 guard_killswitch_on tests above.
_stub_gh_prs() {
  BIN_DIR="${BATS_TEST_TMPDIR}/babysit-gh-stubs"
  rm -rf "$BIN_DIR"; mkdir -p "$BIN_DIR"
  ARGV_LOG="$BIN_DIR/argv.log"; : > "$ARGV_LOG"
  echo '{"comments":[]}' > "$BIN_DIR/comments.json"
  : > "$BIN_DIR/runlog.txt"
  printf '%s' "$1" > "$BIN_DIR/prs.json"
  cat > "$BIN_DIR/gh" <<'GHSTUB'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "$*" >> "$DIR/argv.log"
case "$*" in
  "pr list"*) cat "$DIR/prs.json" ;;
  *"pr view"*"--json comments"*) cat "$DIR/comments.json" ;;
  *"run view"*) cat "$DIR/runlog.txt" ;;
  *) exit 0 ;;
esac
GHSTUB
  chmod +x "$BIN_DIR/gh"
  export PATH="$BIN_DIR:$PATH"

  GUARDS_REPO_DIR="${BATS_TEST_TMPDIR}/babysit-guards-repo"
  rm -rf "$GUARDS_REPO_DIR"; mkdir -p "$GUARDS_REPO_DIR/scripts"
  cat > "$GUARDS_REPO_DIR/scripts/ticket.sh" <<'TSTUB'
#!/usr/bin/env bash
echo "off"
exit 0
TSTUB
  chmod +x "$GUARDS_REPO_DIR/scripts/ticket.sh"
  export GUARDS_REPO="$GUARDS_REPO_DIR"

  AGENT_LOCK_DIR="${BATS_TEST_TMPDIR}/babysit-agent-locks"
  rm -rf "$AGENT_LOCK_DIR"; mkdir -p "$AGENT_LOCK_DIR"
  export AGENT_LOCK_DIR
}

_stub_gh_comments() {
  printf '{"comments":%s}' "$1" > "$BIN_DIR/comments.json"
}

_stub_gh_runlog() {
  printf '%s' "$1" > "$BIN_DIR/runlog.txt"
}

@test "T001805: babysit-prs.sh exists and is bash -n clean" {
  [ -f "$BABYSIT" ]
  run bash -n "$BABYSIT"
  [ "$status" -eq 0 ]
}

@test "T001805: babysit-prs.sh skips when kill-switch is ON" {
  run grep -E 'guard_killswitch_on' "$BABYSIT"
  [ "$status" -eq 0 ]
}

@test "T001805: babysit-prs.sh scans open PRs with the required json fields" {
  run grep -E 'gh pr list --state open --json[^"]*statusCheckRollup' "$BABYSIT"
  [ "$status" -eq 0 ]
}

@test "T001805: draft PRs are skipped" {
  _stub_gh_prs '[{"number":40,"isDraft":true,"mergeStateStatus":"BLOCKED","headRefName":"fix/x","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [ "$status" -eq 0 ]
  run grep -F 'pr comment' "$ARGV_LOG"
  [ "$status" -ne 0 ]   # kein Fix-Kommentar gegen den Draft
}

@test "T001805: PRs labelled ci-babysitter-gave-up are skipped" {
  _stub_gh_prs '[{"number":41,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/y","author":{"login":"paddione"},"labels":[{"name":"ci-babysitter-gave-up"}],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [ "$status" -eq 0 ]
  [[ "$output" != *"selected PR #41"* ]]
}

@test "T001805: Renovate PRs need FACTORY_BABYSIT_RENOVATE opt-in" {
  _stub_gh_prs '[{"number":42,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"renovate/dep","author":{"login":"renovate[bot]"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [[ "$output" != *"selected PR #42"* ]]
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true FACTORY_BABYSIT_RENOVATE=true run bash "$BABYSIT"
  [[ "$output" == *"selected PR #42"* ]]
}

@test "T001805: pending-only checks are not treated as red" {
  _stub_gh_prs '[{"number":43,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/z","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":null}]}]'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [[ "$output" != *"selected PR #43"* ]]
}

@test "T001805: only the smallest-numbered red PR is selected (concurrency 1)" {
  _stub_gh_prs '[{"number":50,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/a","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]},{"number":48,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/b","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [[ "$output" == *"selected PR #48"* ]]
  [[ "$output" != *"selected PR #50"* ]]
}

@test "T001805: CONFLICTING PRs get labelled + notified, never fixed" {
  _stub_gh_prs '[{"number":51,"isDraft":false,"mergeStateStatus":"CONFLICTING","headRefName":"fix/c","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  FACTORY_DRY_RESOLVE=1 run bash "$BABYSIT"
  [[ "$output" == *"QA_NOTIFY_PAYLOAD"* ]]
  run grep -E 'pr edit 51 --add-label ci-babysitter-conflict' "$ARGV_LOG"
  [ "$status" -eq 0 ]
  run grep -F 'run view' "$ARGV_LOG"
  [ "$status" -ne 0 ]   # kein CI-Log-Fetch → kein Fix-Versuch
}

@test "T001805: at 2 prior attempts the PR is given up + notified" {
  _stub_gh_prs '[{"number":52,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/d","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  _stub_gh_comments '[{"body":"<!-- ci-babysitter attempt=1 -->"},{"body":"<!-- ci-babysitter attempt=2 -->"}]'
  FACTORY_DRY_RESOLVE=1 run bash "$BABYSIT"
  [[ "$output" == *"QA_NOTIFY_PAYLOAD"* ]]
  run grep -E 'pr edit 52 --add-label ci-babysitter-gave-up' "$ARGV_LOG"
  [ "$status" -eq 0 ]
}

@test "T001805: escalate-class failures abort without a fix (build_loop_decide gate)" {
  _stub_gh_prs '[{"number":60,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/e","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  _stub_gh_runlog $'SQLSTATE 42P01\nrelation "x" does not exist\n'
  FACTORY_DRY_RESOLVE=1 run bash "$BABYSIT"
  [[ "$output" == *"abort:escalate-gate"* ]] || [[ "$output" == *"QA_NOTIFY_PAYLOAD"* ]]
  run grep -F 'git push' "$ARGV_LOG"
  [ "$status" -ne 0 ]   # Escalate → kein Push
}

@test "T001805: freshness failures route to task freshness:regenerate (dry-run logs, no push)" {
  _stub_gh_prs '[{"number":61,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/f","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  _stub_gh_runlog $'generated artifact(s) are stale\nrun \x27task freshness:regenerate\x27\n'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [[ "$output" == *"freshness"* ]]
  run grep -F 'git worktree add' "$ARGV_LOG"
  [ "$status" -ne 0 ]   # dry-run → kein Worktree/Push
}

@test "T001805: wakeup.sh invokes babysit-prs.sh once outside the brand loop" {
  run grep -E 'scripts/factory/babysit-prs\.sh' "$WAKEUP"
  [ "$status" -eq 0 ]
  # genau EIN Aufruf (nicht in einer for-_x_brand-Schleife dupliziert)
  run bash -c "grep -c 'babysit-prs.sh' '$WAKEUP'"
  [ "$output" -eq 1 ]
}

@test "T001805: babysit-prs.sh emits QA_NOTIFY_PAYLOAD on stdout (no direct PushNotification)" {
  run grep -F 'QA_NOTIFY_PAYLOAD' "$BABYSIT"
  [ "$status" -eq 0 ]
  run grep -F 'PushNotification' "$BABYSIT"
  [ "$status" -ne 0 ]   # Notify läuft über den Wakeup-Kontext, nicht im Script
}

@test "T001805: dry-run posts no marker comment even on an abort decision" {
  _stub_gh_prs '[{"number":62,"isDraft":false,"mergeStateStatus":"BLOCKED","headRefName":"fix/g","author":{"login":"paddione"},"labels":[],"statusCheckRollup":[{"conclusion":"FAILURE"}]}]'
  _stub_gh_runlog $'SQLSTATE 42P01\nrelation "x" does not exist\n'
  FACTORY_DRY_RESOLVE=1 FACTORY_DRY_RUN=true run bash "$BABYSIT"
  [[ "$output" == *"QA_NOTIFY_PAYLOAD"* ]]
  run grep -F 'pr comment' "$ARGV_LOG"
  [ "$status" -ne 0 ]   # dry-run → kein Kommentar, auch im Abort-Pfad
}
