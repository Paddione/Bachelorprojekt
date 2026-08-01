#!/usr/bin/env bats
# tests/spec/mishap-bundle-T002506.bats
# Regression-Suite für das Mishap-Bundle T002506.
#
# RED-Phase: Jeder Test MUSS auf dem Branch VOR den Fixes fehlschlagen und
# GRÜN sein, nachdem P1-P3 implementiert sind. Ergebnis-basiert (T002448-M4):
# Assertions auf command output/status, kein Source-Grep.
#
# expected: FAIL (vor Fix) — vier rote Tests
#
# Abdeckung:
#   M2 — check-merged: Body-Erwähnung zählt NICHT als Merge-Beleg
#   M7 — post-merge-deploy: Squash-Commit (1 Parent) wird gefunden
#   M3 — agent-collision: Lock↔Worktree-Branch-Mismatch erzeugt keinen Alarm
#   M6 — plan-lint: W3 erkennt Dateireferenzen in ### Task (H3)-Headings

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  export AGENT_LOCK_DIR
  AGENT_LOCK_DIR="$(mktemp -d)"
  TEST_TMP_DIR="$(mktemp -d)"
  pushd "$TEST_TMP_DIR" >/dev/null
  git init -q -b main .
  git config user.email "test@test.com"
  git config user.name "Test"
  git commit -q --allow-empty -m "Initial commit"
  # origin/main-Ref anlegen, damit check-merged/prüfende Skripte ihn finden
  git branch origin/main 2>/dev/null || true
  git config --local core.hooksPath /dev/null 2>/dev/null || true
  popd >/dev/null
}

teardown() {
  rm -rf "$AGENT_LOCK_DIR" 2>/dev/null || true
  rm -rf "$TEST_TMP_DIR" 2>/dev/null || true
}

# ── M2: check-merged zählt nur [T-Nummer] im Betreff, nicht im Body ──────#

@test "M2: check-merged ignoriert Ticket-ID nur im Commit-Body" {
  pushd "$TEST_TMP_DIR" >/dev/null
  # Commit für T002493, der im BODY (Dateiinhalt goals.md) [[T002494]] referenziert
  mkdir -p .claude/lib
  cat > goals.md <<'EOF'
  Auflösung erfordert eine Entscheidung Gate↔Test, siehe [[T002494]].
EOF
  git add goals.md
  git commit -qm "chore(agents): Health-Gates auf Target [T002493] (#3561)"
  # origin/main auf den neuen Stand bringen (Squash-Commit-Simulation)
  git branch -f origin/main HEAD
  # Body-Erwähnung von T002494: check-merged darf rc=0 melden (nicht gemergt)
  run bash "$REPO/scripts/agent-lock.sh" check-merged T002494
  echo "output: $output | status: $status"
  [ "$status" -eq 0 ]
  popd >/dev/null
}

@test "M2: check-merged findet [T-Nummer] im Commit-Betreff" {
  pushd "$TEST_TMP_DIR" >/dev/null
  git commit -q --allow-empty -m "fix(factory): Thinking-Gate baseUrl [T002501] (#3572)"
  git branch -f origin/main HEAD
  run bash "$REPO/scripts/agent-lock.sh" check-merged T002501
  echo "output: $output | status: $status"
  [ "$status" -eq 1 ]
  popd >/dev/null
}

# ── M7: post-merge-deploy findet Squash-Commit (1 Parent) ────────────────#

@test "M7: post-merge-deploy findet Squash-Commit mit einem Parent" {
  pushd "$TEST_TMP_DIR" >/dev/null
  # Simulierter Squash-Merge-Commit: EIN Parent, [T002501] im Betreff
  echo "change" > change.txt
  git add change.txt
  git commit -qm "fix(factory): Thinking-Gate an lokaler baseUrl [T002501] (#3572)"
  git branch -f origin/main HEAD
  # Das Skript sucht den Commit über --grep auf [T002501]; vor dem Fix (--merges)
  # wäre MERGE_COMMIT leer → exit 3. Nach dem Fix: Commit gefunden, Skript läuft
  # weiter (Deploy-Trigger-Check mit exit 0, da change.txt kein bekannter Trigger).
  run bash "$REPO/scripts/devflow-post-merge-deploy.sh" T002501
  echo "output: $output | status: $status"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Keine bekannten Deploy-Trigger"* ]]
  popd >/dev/null
}

# ── M3: agent-collision — Lock↔Worktree-Branch-Mismatch erzeugt kein Alarm ─#

@test "M3: Lock mit branch-mismatch Worktree erzeugt keine COLLISION-Warnung" {
  pushd "$TEST_TMP_DIR" >/dev/null
  # Zweiten Branch + Worktree anlegen (peer)
  git worktree add -q -b peer-branch ../peer-wt main 2>/dev/null || \
    git checkout -q -b peer-branch 2>/dev/null || true
  # Lock: branch=peer-branch, aber worktree zeigt auf UNSEREN Worktree (main)
  cat > "$AGENT_LOCK_DIR/branch__peer-branch.json" <<'JSON'
{"scope":"branch","id":"peer-branch","owner_sid":"other-session","owner_pid":"999999","tool":"claude","label":"dev-flow-fix","worktree":"REPLACE_WT","branch":"peer-branch","host":"test","created_at":"1","heartbeat_at":"1"}
JSON
  sed -i "s#REPLACE_WT#$TEST_TMP_DIR#" "$AGENT_LOCK_DIR/branch__peer-branch.json"
  # Datei anlegen und stagen (als würde sie diese Session anfassen)
  echo "new" > brand-new-file.txt
  git add brand-new-file.txt
  # Der Lock behauptet worktree=unser Repo, aber branch=peer-branch — unser Repo
  # steht auf main → Mismatch. Vor dem Fix: COLLISION-Warnung (false positive).
  AGENT_LOCK_FAKE_ALIVE="other-session" AGENT_LOCK_DIR="$AGENT_LOCK_DIR" \
    run bash "$REPO/scripts/agent-collision.sh" check --staged --quiet
  echo "output: $output | status: $status"
  [ "$status" -eq 0 ]
  popd >/dev/null
}

# ── M6: plan-lint W3 erkennt ### Task (H3)-Headings ──────────────────────#

@test "M6: plan-lint W3 meldet keine false negative für ### Task-Headings" {
  cat > "$TEST_TMP_DIR/plan-h3.md" <<'EOF'
---
title: Test
ticket_id: T000000
domains: [test]
status: plan_staged
---

# Implementation Plan: test

## File Structure

### Geänderte Dateien
- `scripts/foo.sh` — test

### Task 1: Foo

**Purpose:** Test

**Files:**
- `scripts/foo.sh`

**Steps:**
1. Do something

**Verify:**
1. It works
EOF
  # W3 ist advisory (Warnung, kein Hard-Fail) — der Test prüft, dass KEINE
  # W3-Meldung für scripts/foo.sh erscheint (vor Fix: "no task references it").
  run bash "$REPO/scripts/plan-lint.sh" "$TEST_TMP_DIR/plan-h3.md"
  echo "output: $output | status: $status"
  [[ "$output" != *"W3: \`scripts/foo.sh\` is listed in File Structure but no task references it"* ]]
}
