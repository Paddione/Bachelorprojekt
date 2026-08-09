#!/usr/bin/env bats
# SSOT: openspec/specs/factory-reclaim-lock-respect.md
# Ticket: T002849 — Block 0b ("Worktree+branch match beats a dead/mismatched SID",
# T002204/T002513) in scripts/agent-lock.sh _reapable() only checks the heartbeat
# against the full AGENT_LOCK_TTL (1800s) when the worktree exists and the branch
# matches. It never checks whether owner_pid is still alive. A crashed session
# whose worktree+branch still match therefore blocks its ticket for up to 30
# minutes even though `kill -0 $owner_pid` already proves it's dead.
#
# Precedent: Block 0a (T002785 Befund 7) already reaps "worktree missing + pid
# dead" after AGENT_LOCK_GRACE (120s) instead of waiting for the full TTL. This
# file adds the mirror case: "worktree PRESENT + branch matches + pid dead".
#
# Tests check REAL command output (agent-lock.sh check / cmd exit code), not
# script source (T002448-M4).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  AGENT_LOCK="$REPO_ROOT/scripts/agent-lock.sh"

  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"
  # No SID counts as alive -> forces the fallback paths in _reapable, same
  # convention as tests/spec/factory-reclaim-lock-respect.bats.
  export AGENT_LOCK_FAKE_ALIVE=""
  export AGENT_LOCK_GRACE=5   # shrink the grace window so the test runs fast

  # A minimal real git worktree so `git -C "$wt" rev-parse --abbrev-ref HEAD`
  # resolves to a real branch that Block 0b can match against.
  WT="$BATS_TEST_TMPDIR/fake-worktree"
  mkdir -p "$WT"
  git -C "$WT" init -q
  git -C "$WT" config user.email t@example.com
  git -C "$WT" config user.name test
  git -C "$WT" commit -q --allow-empty -m init
  git -C "$WT" checkout -q -b fix/demo-T002849
}

# usage: _mk_lock <id> <pid> <age_seconds>
# Fixed fields: scope=ticket, sid=999999 (dead numeric, forces block 0b),
# worktree=$WT, branch=fix/demo-T002849 (matches $WT's checked-out branch).
_mk_lock() {
  local id="$1" pid="$2" age="$3" ts
  ts=$(( $(date +%s) - age ))
  cat > "$AGENT_LOCK_DIR/ticket__${id}.json" <<EOF
{
  "scope": "ticket",
  "id": "$id",
  "owner_sid": "999999",
  "owner_pid": "$pid",
  "tool": "claude",
  "label": "crashed-session",
  "worktree": "$WT",
  "branch": "fix/demo-T002849",
  "ticket": "",
  "host": "testhost",
  "created_at": "$ts",
  "heartbeat_at": "$ts"
}
EOF
}

# ─────────────────────────────────────────────────────────────────────────────
# RED (T002849 main finding): worktree+branch match + dead pid + age past grace
# ─────────────────────────────────────────────────────────────────────────────

@test "T002849: worktree+branch-matched claim with dead pid reaps after grace period" {
  # PID 4194303 is above the usual pid_max — practically never a real process.
  _mk_lock T002849DEAD 4194303 30   # age 30s > AGENT_LOCK_GRACE(5s), well under TTL(1800s)
  run bash "$AGENT_LOCK" check ticket T002849DEAD
  [ "$status" -eq 0 ]
  [[ "$output" == "free" ]]
}

# ─────────────────────────────────────────────────────────────────────────────
# Positiv-Anker (T002356-M1): resume protection must survive the fix — a fresh
# claim (age < grace) with a dead pid stays held, since a resume may not have
# written its own heartbeat yet.
# ─────────────────────────────────────────────────────────────────────────────

@test "T002849: fresh worktree+branch-matched claim with dead pid stays held (resume window)" {
  _mk_lock T002849FRESH 4194303 1   # age 1s < AGENT_LOCK_GRACE(5s)
  run bash "$AGENT_LOCK" check ticket T002849FRESH
  [ "$status" -eq 3 ]
  [[ "$output" == *"held"* ]]
}

# ─────────────────────────────────────────────────────────────────────────────
# Positiv-Anker: a live pid always wins, regardless of age — proves the new
# grace-based reap does not regress the existing live-pid protection.
# ─────────────────────────────────────────────────────────────────────────────

@test "T002849: worktree+branch-matched claim with a live pid stays held past grace" {
  _mk_lock T002849LIVE "$$" 30   # $$ is this bats process — guaranteed alive
  run bash "$AGENT_LOCK" check ticket T002849LIVE
  [ "$status" -eq 3 ]
  [[ "$output" == *"held"* ]]
}
