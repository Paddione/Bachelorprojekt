#!/usr/bin/env bats
# tests/spec/agent-lock-claim-persist.bats
# SSOT: openspec/changes/agent-lock-claim-persist/specs/active-sessions-hub.md
# Regression suite for T001384 (agent-lock.sh claim persistiert Lock-Datei
# nicht zuverlässig). Deckt die drei zusammenwirkenden Defekte in
# scripts/agent-lock.sh ab.
#
# RED phase — every test in this file MUST FAIL on the current
# scripts/agent-lock.sh (before the fix) and MUST be GREEN after
# dev-flow-execute implementiert.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  export AGENT_LOCK_DIR
  AGENT_LOCK_DIR="$(mktemp -d)"
  export CLAUDE_SESSION_ID="claude-t001384-suite"
  unset AGENT_LOCK_SID
}

teardown() {
  rm -rf "$AGENT_LOCK_DIR" 2>/dev/null || true
}

# ── Defekt 1 — sid-alive schützt vor worktree-missing im Reaper ──────────#

@test "T001384-D1: reap lässt claim mit lebendem SID unangetastet, auch wenn Worktree-Pfad fehlt" {
  run bash "$LOCK" claim branch fix/t001384-agent-lock-claim-persist \
    --worktree /tmp/wt-that-definitely-does-not-exist-12345 \
    --label dev-flow-plan
  [ "$status" -eq 0 ]
  [ -f "$AGENT_LOCK_DIR/branch__fix-t001384-agent-lock-claim-persist.json" ]

  run bash "$LOCK" reap
  [ "$status" -eq 0 ]
  # Lock-Datei MUSS nach reap noch da sein (lebender SID schützt).
  [ -f "$AGENT_LOCK_DIR/branch__fix-t001384-agent-lock-claim-persist.json" ]
  # .reap.log darf KEINEN worktree-missing-Eintrag für diesen Claim haben.
  run cat "$AGENT_LOCK_DIR/.reap.log"
  [[ "$output" != *"branch/fix-t001384-agent-lock-claim-persist worktree-missing"* ]]
}

@test "T001384-D1: list zeigt live-claim mit fehlendem Worktree-Pfad (nicht stale)" {
  bash "$LOCK" claim branch fix/t001384-list-probe \
    --worktree /tmp/wt-list-probe-missing --label probe
  run bash "$LOCK" list
  [ "$status" -eq 0 ]
  # Zeile mit dem Branch muss in Spalte STATE "live" haben, nicht "stale".
  echo "$output" | grep -E 'branch\s+fix/t001384-list-probe' | grep -E 'live'
}

# ── Defekt 2 — cmd_reap hält den Registry-Lock ──────────────────────────#

@test "T001384-D2: cmd_reap hält flock 9 auf .registry.lock während des Sweeps" {
  # Subshell A öffnet _with_lock manuell und hält den Lock für 1,2 s.
  # Subshell B ruft NUR den Lock-File-Sweep (Schritt 3) von cmd_reap auf,
  # nicht die langsamen Schritte 1+2 — also via eines kleinen Wrappers,
  # der nur `_with_lock + for f in ./*.json; reap+rm` nachbildet.
  # Ohne Lock läuft der Wrapper in < 50 ms durch; mit Lock wartet er
  # ≥ 1,0 s.
  (
    exec 9>"$AGENT_LOCK_DIR/.registry.lock"
    flock 9
    sleep 1.2
  ) >/dev/null 2>&1 &
  LOCKER_PID=$!

  # Kurz warten, damit Subshell A sicher den Lock hält.
  sleep 0.15

  # Wir messen reap. Wenn cmd_reap den Lock ignoriert, ist es < 500 ms;
  # wenn es den Lock respektiert, braucht es ≥ 1,0 s.
  START=$(date +%s%N)
  bash "$LOCK" reap >/dev/null 2>&1
  END=$(date +%s%N)
  wait "$LOCKER_PID" 2>/dev/null || true

  ELAPSED_MS=$(( (END - START) / 1000000 ))
  [ "$ELAPSED_MS" -ge 800 ] || {
    echo "cmd_reap brauchte nur ${ELAPSED_MS}ms — Registry-Lock wurde nicht gehalten" >&2
    return 1
  }
}

@test "T001384-D2: claim mit worktree-Pfad überlebt parallelen reap nicht (RED → GREEN nach Fix)" {
  # Wenn wir claim mit --worktree /tmp/wt-…-missing aufrufen, ist der
  # Claim frisch (live SID), aber der worktree-Pfad fehlt. Ein paralleler
  # reap DARF diese Datei NICHT löschen, weil der SID lebt (Fix zu
  # Defekt 1). Vor dem Fix löscht der reap sie → Datei fehlt nach den
  # beiden Subshells. Nach dem Fix überlebt sie.
  for i in $(seq 1 30); do
    bash "$LOCK" claim branch fix/t001384-race-$i \
      --worktree /tmp/wt-race-missing-$i --label race >/dev/null 2>&1 &
    CLAIM_PID=$!
    bash "$LOCK" reap >/dev/null 2>&1 &
    REAP_PID=$!
    wait "$CLAIM_PID" "$REAP_PID" 2>/dev/null || true
    # Nach dem Fix MUSS die Datei da sein (lebender SID schützt).
    if [ ! -f "$AGENT_LOCK_DIR/branch__fix-t001384-race-$i.json" ]; then
      echo "Round $i: claim mit worktree-Pfad wurde vom reap gelöscht — Defekt 1 nicht behoben" >&2
      return 1
    fi
  done
}

# ── Defekt 3 — _lock_dir nutzt --show-toplevel als Anker ────────────────#

@test "T001384-D3: _lock_dir nutzt git rev-parse --show-toplevel als Anker" {
  # Defekt 3: _lock_dir resolvet den relativen git-common-dir per
  #   cd "$cd" && pwd
  # in einer Subshell, abhängig vom cwd des Aufrufers. Der Fix muss
  # --show-toplevel davor aufrufen, damit der Pfad unabhängig vom
  # aktuellen cwd stabil ist.
  #
  # Statischer Check auf den Quellcode: _lock_dir MUSS show-toplevel
  # referenzieren, sonst ist der Fix nicht da.
  grep -Eq 'git[[:space:]]+rev-parse[[:space:]]+--show-toplevel' "$LOCK"
}

# ── Negativtest — andere Session wird weiterhin abgewiesen ──────────────#

@test "T001384-regression: zweiter claim aus anderer Session bleibt abgewiesen" {
  bash "$LOCK" claim ticket T001384-regression --label first-session
  [ -f "$AGENT_LOCK_DIR/ticket__T001384-regression.json" ]
  export CLAUDE_SESSION_ID="claude-other-session"
  run bash "$LOCK" claim ticket T001384-regression --label second-session
  [ "$status" -eq 1 ]
  [[ "$output" == *"bereits gehalten"* ]]
  # Die ursprüngliche Lock-Datei darf NICHT überschrieben worden sein.
  owner=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T001384-regression.json")
  [ "$owner" = "claude-t001384-suite" ]
}
