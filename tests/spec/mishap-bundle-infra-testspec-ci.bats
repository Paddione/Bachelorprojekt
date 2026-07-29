#!/usr/bin/env bats
# tests/spec/mishap-bundle-infra-testspec-ci.bats
# T002448 — Mishap-Bundle: Infra + CI scripts (10 Einträge).
#
# Each test must FAIL (RED) on the current fix/t2448-mishap-infra branch and
# PASS (GREEN) after the corresponding fix lands.
#
#   M1  — scripts/worktree-create.sh: muss auf nicht-main Branch abbrechen mit
#         klarer Meldung "main checkout must be on 'main'" [T002448-M1].
#   M2  — .githooks/commit-msg: rejection must say "No commit was created"
#         (or equivalent clear message), ohne SKIP_COMMIT_VS_DIFF/Hinweise auf
#         pre-push Bypass.
#   M3  — scripts/agent-lock.sh: --worktree "." muss absolut-kanonischen Pfad
#         speichern (kein ./-Segment, kein Trailing-Slash).
#   M4  — CLAUDE.md: muss Guideline enthalten, dass Tests command outputs/results
#         prüfen statt implementation source code zu greppen.
#   M5  — .agents/skills/dev-flow-plan/SKILL.md: muss Dokumentation zur
#         Bug-Cause-Verifikation während des Triage enthalten.
#   M6  — .github/workflows/ci.yml: commit-vs-diff section darf KEIN unbounded
#         BASE_SHA..HEAD_SHA Range verwenden.
#   M7  — scripts/devflow-verify.sh: muss existieren, executable sein und
#         "timeout" + "background" Keywords enthalten.
#   M8  — scripts/agent-lock.sh reap: Lock mit totem PID + lebendem SID muss
#         aufgeräumt werden (PID-dead schlägt SID-alive).
#   M9  — scripts/devflow-post-merge-deploy.sh: darf NICHT `git log origin/main -1`
#         verwenden (fragiler Pattern).
#   M10 — scripts/devflow-post-merge-deploy.sh: muss ticket-ID matching Pattern
#         wie `grep.*T00` enthalten.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  WT_CREATE="$REPO/scripts/worktree-create.sh"
  POST_MERGE="$REPO/scripts/devflow-post-merge-deploy.sh"
  VERIFY_SH="$REPO/scripts/devflow-verify.sh"
  CLAUDE_MD="$REPO/CLAUDE.md"
  SKILL_MD="$REPO/.agents/skills/dev-flow-plan/SKILL.md"
  CI_YML="$REPO/.github/workflows/ci.yml"
  COMMIT_MSG_HOOK="$REPO/.githooks/commit-msg"
  VALIDATE_SH="$REPO/scripts/validate-commit-msg.sh"
  CHECK_VS_DIFF="$REPO/scripts/check-commit-vs-diff.sh"
}

# ── M1: worktree-create.sh non-main abort ─────────────────────────────────#

@test "T002448-M1: worktree-create.sh rejects running on a non-main branch" {
  # Create a test git repo WITH origin/main (so all preconditions are met),
  # then switch to a non-main branch. The script must STILL abort with a
  # "must be on main" error — it currently DOES NOT, making this RED.
  local test_repo; test_repo="$(mktemp -d)"
  local wt_path="/tmp/wt-$$-m1"

  git init -q "$test_repo"
  git -C "$test_repo" config user.email "test@test"
  git -C "$test_repo" config user.name "Test"

  # Create main branch with a commit and set up origin/main ref so the
  # divergence guard passes and git worktree add has a valid base.
  git -C "$test_repo" checkout -q -b main
  git -C "$test_repo" commit -q --allow-empty -m "initial on main"
  git -C "$test_repo" update-ref refs/remotes/origin/main main

  # Switch to a non-main branch.
  git -C "$test_repo" checkout -q -b non-main-branch
  git -C "$test_repo" commit -q --allow-empty -m "on non-main"

  # Run the script from within the test repo.
  # RED: currently succeeds (exit 0) because there is no main-branch check.
  # After the fix, it must abort with exit != 0 and mention "main" in error.
  run bash -c "cd '$test_repo' && bash '$WT_CREATE' test-br '$wt_path'"
  [ "$status" -ne 0 ]
  [[ "$output" == *"main"* ]]

  rm -rf "$test_repo" "$wt_path"
}

# ── M2: commit-msg rejection clarity ───────────────────────────────────────#

@test "T002448-M2: commit-msg hook emits clear rejection mentioning no commit was created" {
  # Create a temp test repo, install the commit-msg hook, attempt a
  # non-conventional commit, and verify the rejection is clear and does NOT
  # reference pre-push bypass context.
  local test_repo; test_repo="$(mktemp -d)"
  pushd "$test_repo" >/dev/null || return 1
  git init -q
  git config user.email "test@test"
  git config user.name "Test"
  mkdir -p .githooks
  ln -s "$COMMIT_MSG_HOOK" .githooks/commit-msg
  git config core.hooksPath .githooks
  echo "content" > test.txt
  git add test.txt

  # Attempt a bad commit (subject does not conform to Conventional Commits).
  run git commit -m "bad msg"

  # Must reject.
  [ "$status" -ne 0 ]

  # RED: currently the hook prints technical lint messages but does NOT
  # clearly state "No commit was created" or an equivalent plain-language
  # rejection. After the fix, stderr must contain an explicit declaration
  # that the commit was blocked.
  [[ "$output" == *"No commit was created"* ]]

  # Must NOT reference pre-push bypass mechanisms — the rejection must be
  # self-contained at commit-msg time, not mentioning SKIP_COMMIT_VS_DIFF
  # or other pre-push bypass env vars.
  [[ "$output" != *"SKIP_COMMIT"* ]]

  popd >/dev/null || return 1
  rm -rf "$test_repo"
}

# ── M3: agent-lock worktree path normalization ─────────────────────────────#

@test "T002448-M3: agent-lock claim --worktree '.' stores absolute canonical path" {
  # When --worktree "." is passed, the stored worktree field must be an
  # absolute canonical path starting with "/" and containing no "./" or
  # "../" segments and no trailing slash.
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  local testdir; testdir="$(mktemp -d)"

  # Claim from a known directory so $PWD is deterministic.
  (cd "$testdir" && AGENT_LOCK_DIR="$AGENT_LOCK_DIR" AGENT_LOCK_SID="m3-test" \
    bash "$LOCK" claim branch t --worktree ".") >/dev/null 2>&1

  LF="$AGENT_LOCK_DIR/branch__t.json"
  [ -f "$LF" ]

  # Read the worktree field from the lock JSON.
  WT_FIELD="$(grep -o '"worktree": *"[^"]*"' "$LF" | sed 's/"worktree": *"//;s/"$//')"

  # Must be absolute path (starts with /).
  [[ "$WT_FIELD" == /* ]]

  # Must NOT contain ./ or ../ segments (canonical — RED: current code
  # stores "$PWD/" with trailing slash and no symlink resolution).
  [[ "$WT_FIELD" != *"/."* ]]
  [[ "$WT_FIELD" != *"/.."* ]]

  # Must NOT have trailing slash (RED: current code produces "$PWD/").
  [[ "$WT_FIELD" != */ ]]

  rm -rf "$AGENT_LOCK_DIR" "$testdir"
}

# ── M4: CLAUDE.md advises output checking over source grepping ─────────────#

@test "T002448-M4: CLAUDE.md advises checking command outputs/results rather than grepping implementation source" {
  # RED: CLAUDE.md currently lacks explicit guidance about preferring
  # runtime output verification over static grep of source code. After the
  # fix, it must contain such a convention.
  grep -q 'command output\|check.*result\|run.*command.*rather.*grep\|output.*behavior\|output.*verification' "$CLAUDE_MD"
}

# ── M5: dev-flow-plan SKILL.md cause-verification text ─────────────────────#

@test "T002448-M5: dev-flow-plan SKILL.md documents bug cause verification during triage" {
  # RED: the SKILL.md currently lacks documentation about verifying/
  # validating bug causes during the triage phase of the Fix-Pfad. After
  # the fix, it must contain such guidance.
  grep -q 'cause.*verif\|valid.*cause\|triage.*cause\|root.cause.*verif\|bug.*cause.*triage' "$SKILL_MD"
}

# ── M6: ci.yml unbounded range check ───────────────────────────────────────#

@test "T002448-M6: ci.yml commit-vs-diff section avoids unbounded BASE_SHA..HEAD_SHA range" {
  # RED: .github/workflows/ci.yml currently uses ${BASE_SHA}..${HEAD_SHA}
  # in the commit-lint job (lines 588, 618). After the fix, this unbounded
  # range must be replaced with a scoped alternative (e.g., merge-base
  # anchored). Asserting ABSENCE makes the test RED now (pattern is present).
  run grep -qF '${BASE_SHA}..${HEAD_SHA}' "$CI_YML"
  [ "$status" -ne 0 ]
}

# ── M7: devflow-verify.sh exists ───────────────────────────────────────────#

@test "T002448-M7: devflow-verify.sh exists, is executable, and contains timeout+background keywords" {
  # RED: scripts/devflow-verify.sh does not exist yet. After creation it
  # must be executable and contain both "timeout" and "background"
  # references.
  [ -x "$VERIFY_SH" ]
  grep -q 'timeout' "$VERIFY_SH"
  grep -q 'background' "$VERIFY_SH"
}

# ── M8: agent-lock reap PID-dead beats SID-alive ───────────────────────────#

@test "T002448-M8: agent-lock reap removes lock with dead PID even when SID is alive" {
  # When a lock has an alive (non-numeric) SID but a dead PID, reap must
  # still clean it up — PID-dead beats SID-alive. Currently _reapable
  # returns 1 (not reapable) when SID is alive, regardless of PID state.
  # RED: the lock survives reap. After the fix, dead PID triggers reap.
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR

  # Create claim with a non-numeric SID (always treated as alive by
  # _sid_alive) so SID-alive check is the only thing keeping the lock.
  AGENT_LOCK_SID="still-alive-m8" \
    bash "$LOCK" claim ticket t2448-m8 --label mishap8 >/dev/null 2>&1

  LF="$AGENT_LOCK_DIR/ticket__t2448-m8.json"
  [ -f "$LF" ]

  # Overwrite owner_pid with a guaranteed-dead PID.
  sed -i 's/"owner_pid": "[0-9]*"/"owner_pid": "999999"/' "$LF"

  # Run reap (without AGENT_LOCK_SID so it evaluates the lock file's SID).
  bash "$LOCK" reap >/dev/null 2>&1

  # RED: currently the lock survives because _sid_alive("still-alive-m8")
  # returns 0 (alive, non-numeric) and _reapable returns 1 without ever
  # considering the dead PID. After the fix, dead PID triggers cleanup.
  [ ! -f "$LF" ]

  rm -rf "$AGENT_LOCK_DIR"
}

# ── M9: devflow-post-merge-deploy fragile git log ──────────────────────────#

@test "T002448-M9: devflow-post-merge-deploy.sh avoids fragile git log origin/main -1 pattern" {
  # The `git log origin/main -1` pattern is fragile because it relies on
  # origin/main being present and current. After the fix, this must be
  # replaced with a deterministic reference (e.g., the merge commit SHA).
  # RED: currently line 7 uses this pattern.
  run grep -q 'git log origin/main -1' "$POST_MERGE"
  [ "$status" -ne 0 ]
}

# ── M10: devflow-post-merge-deploy ticket ID match ─────────────────────────#

@test "T002448-M10: devflow-post-merge-deploy.sh matches ticket IDs with grep.*T00 pattern" {
  # After the fix, the deploy script must grep for ticket IDs in the merge
  # diff (pattern: grep.*T00) to auto-detect which ticket was merged.
  # RED: no such pattern exists currently.
  grep -q 'grep.*T00' "$POST_MERGE"
}
