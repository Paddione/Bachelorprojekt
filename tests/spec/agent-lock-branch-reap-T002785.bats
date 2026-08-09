#!/usr/bin/env bats
# tests/spec/agent-lock-branch-reap-T002785.bats
# T002785 Befund 7 — Branch-Locks werden von den schnellen Reap-Signalen nicht
# erfasst. Ein scope=branch-Lock mit totem owner_pid und entferntem Worktree
# ueberlebte zwei reap-Laeufe als STATE=live, weil _sid_alive() non-numeric
# Harness-SIDs per Konvention IMMER als lebendig behandelt (die SID-Alive-
# Kurzschlusspruefung in _reapable greift vor pid-dead/worktree-missing) und
# erst die heartbeat-TTL nach ~35 min den Lock erntet (T002785, .reap.log
# kennt worktree-missing als Grund fuer ticket-Scope, fuer branch-Scope nicht).
#
# Pruefmodus: OUTPUT-VERIFIKATION (T002448-M4) via CLI; der Lauf ist gegen
# einen mktemp-Lock-Dir isoliert und fasst keine echten Locks an.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  export AGENT_LOCK_DIR
  AGENT_LOCK_DIR="$(mktemp -d)"
  # [T002375-p1] ambient CLAUDE_CODE_SESSION_ID entfernen (sonst loesen alle
  # "Sessions" dieses Tests auf dieselbe SID auf).
  unset CLAUDE_CODE_SESSION_ID
  export CLAUDE_SESSION_ID="claude-t002785-suite"
  unset AGENT_LOCK_SID
}

teardown() {
  rm -rf "$AGENT_LOCK_DIR" 2>/dev/null || true
}

_age_lock() {  # <lock-file> — created_at/heartbeat_at eine Stunde zurueck
  local f="$1" old; old="$(( $(date +%s) - 3600 ))"
  jq --argjson old "$old" '.created_at = $old | .heartbeat_at = $old' "$f" > "$f.tmp" \
    && mv "$f.tmp" "$f"
}

@test "T002785-7: toter Branch-Lock (PID tot, Worktree weg, alter Claim) wird schnell geerntet" {
  bash "$LOCK" claim branch fix/t002785-reap-probe \
    --worktree /tmp/definitely-missing-t002785 --label probe
  local lf="$AGENT_LOCK_DIR/branch__fix-t002785-reap-probe.json"
  [ -f "$lf" ]
  _age_lock "$lf"

  run bash "$LOCK" reap
  [ "$status" -eq 0 ]
  # Lock-Datei MUSS weg sein — kein Warten auf die heartbeat-TTL.
  [ ! -f "$lf" ] || { echo "toter Branch-Lock nach reap noch da: $lf"; false; }
  # Grund muss im .reap.log stehen (auditierbar, wie bei ticket-Scope).
  run cat "$AGENT_LOCK_DIR/.reap.log"
  [[ "$output" == *"branch/fix/t002785-reap-probe worktree-missing"* ]] \
    || { echo "kein worktree-missing-Eintrag im .reap.log: $output"; false; }
}

@test "T002785-7: frischer Branch-Lock ohne Worktree bleibt verschont (Grace-Frist, T001384-D1) [Positiv-Anker]" {
  bash "$LOCK" claim branch fix/t002785-reap-fresh \
    --worktree /tmp/definitely-missing-t002785 --label probe
  local lf="$AGENT_LOCK_DIR/branch__fix-t002785-reap-fresh.json"
  [ -f "$lf" ]

  run bash "$LOCK" reap
  [ "$status" -eq 0 ]
  # Junger Claim (< AGENT_LOCK_GRACE) ueberlebt — genau die T001384-D1-Invariante.
  [ -f "$lf" ] || { echo "frischer Branch-Lock wurde faelschlich geerntet"; false; }
  run cat "$AGENT_LOCK_DIR/.reap.log"
  [[ "$output" != *"branch/fix/t002785-reap-fresh worktree-missing"* ]] \
    || { echo "frischer Claim wurde als worktree-missing protokolliert"; false; }
}

@test "T002785-7: Lock mit lebendem Worktree bleibt unangetastet [Positiv-Anker]" {
  local wt; wt="$(mktemp -d)"
  bash "$LOCK" claim branch fix/t002785-reap-wt \
    --worktree "$wt" --label probe
  local lf="$AGENT_LOCK_DIR/branch__fix-t002785-reap-wt.json"
  _age_lock "$lf"

  run bash "$LOCK" reap
  [ "$status" -eq 0 ]
  # Worktree existiert noch — kein worktree-missing-Signal, Lock bleibt.
  [ -f "$lf" ] || { echo "Lock mit existierendem Worktree wurde geerntet"; false; }
  rm -rf "$wt"
}
