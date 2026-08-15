#!/usr/bin/env bats
# tests/spec/active-sessions-hub/agent-lock-release-cwd.bats
# SSOT: openspec/specs/active-sessions-hub.md (Delta: openspec/changes/agent-lock-release-cwd)
#
# T006290 — Mishap-Fix: `agent-lock.sh release branch` + nachfolgender Worktree-Remove
# liefen mit Shell-cwd im Worktree. Der Remove selbst gelingt (rc=0), aber jedes
# Folgekommando stirbt mit "Unable to read current working directory" (rc=128), der
# Branch-Lock blieb stale und musste per reap nachgeräumt werden.
#
# Reproducer (2026-08-15, /tmp-Sandbox):
#   cd <wt> && git worktree remove <wt> --force && git worktree prune
#   -> prune: fatal: Unable to read current working directory (rc=128)
#
# Pruefmodus: KOMMANDO-ERGEBNIS-VERIFIKATION (T002448-M4) via CLI; der Lauf ist gegen
# einen mktemp-Lock-Dir und ein mktemp-Worktree-Verzeichnis isoliert und fasst keine
# echten Locks oder Worktrees an.
#
# Jeder Block belegt ZUERST den Positiv-Fall (release von ausserhalb) bzw. den
# Bezugspunkt, DANN die eigentliche Aussage (T002356-M1).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  export AGENT_LOCK_DIR
  AGENT_LOCK_DIR="$(mktemp -d)"
  # [T002375-p1] ambient CLAUDE_CODE_SESSION_ID entfernen (sonst loesen alle
  # "Sessions" dieses Tests auf dieselbe SID auf).
  unset CLAUDE_CODE_SESSION_ID
  export CLAUDE_SESSION_ID="claude-t006290-suite"
  unset AGENT_LOCK_SID
}

teardown() {
  rm -rf "$AGENT_LOCK_DIR" 2>/dev/null || true
}

@test "T006290: release branch von ausserhalb des Worktrees loest den Lock [Positiv-Anker]" {
  local wt; wt="$(mktemp -d)"
  bash "$LOCK" claim branch fix/agent-lock-cwd-probe \
    --worktree "$wt" --label probe
  local lf="$AGENT_LOCK_DIR/branch__fix-agent-lock-cwd-probe.json"
  [ -f "$lf" ]

  # cwd liegt ausserhalb des Worktrees (BATS-Testverzeichnis) — normaler Release-Pfad.
  run bash "$LOCK" release branch fix/agent-lock-cwd-probe
  [ "$status" -eq 0 ]
  [ ! -f "$lf" ] || { echo "Lock trotz release von ausserhalb noch da"; false; }
  rm -rf "$wt"
}

@test "T006290: release branch mit cwd im Worktree wird verweigert, Lock bleibt" {
  local wt; wt="$(mktemp -d)"
  bash "$LOCK" claim branch fix/agent-lock-cwd-probe \
    --worktree "$wt" --label probe
  local lf="$AGENT_LOCK_DIR/branch__fix-agent-lock-cwd-probe.json"
  [ -f "$lf" ]

  cd "$wt"
  run bash "$LOCK" release branch fix/agent-lock-cwd-probe
  [ "$status" -eq 1 ]
  # Remedie auf stderr: Release aus dem Haupt-Repo heraus (cwd-Wechsel).
  [[ "$output" == *"worktree"* ]] \
    || { echo "Verweigerung nennt den Worktree-Kontext nicht: $output"; false; }
  [ -f "$lf" ] || { echo "Lock wurde trotz Verweigerung entfernt"; false; }
  cd "$BATS_TEST_DIRNAME"
  rm -rf "$wt"
}

@test "T006290: release branch aus Worktree-Subverzeichnis wird verweigert [Containment]" {
  local wt; wt="$(mktemp -d)"
  mkdir -p "$wt/scripts"
  bash "$LOCK" claim branch fix/agent-lock-cwd-probe \
    --worktree "$wt" --label probe
  local lf="$AGENT_LOCK_DIR/branch__fix-agent-lock-cwd-probe.json"
  [ -f "$lf" ]

  cd "$wt/scripts"
  run bash "$LOCK" release branch fix/agent-lock-cwd-probe
  [ "$status" -eq 1 ]
  [ -f "$lf" ] || { echo "Lock trotz Verweigerung aus Subverzeichnis entfernt"; false; }
  cd "$BATS_TEST_DIRNAME"
  rm -rf "$wt"
}

@test "T006290: release branch mit --force aus dem Worktree loest trotzdem [Override]" {
  local wt; wt="$(mktemp -d)"
  bash "$LOCK" claim branch fix/agent-lock-cwd-probe \
    --worktree "$wt" --label probe
  local lf="$AGENT_LOCK_DIR/branch__fix-agent-lock-cwd-probe.json"
  [ -f "$lf" ]

  cd "$wt"
  run bash "$LOCK" release branch fix/agent-lock-cwd-probe --force
  [ "$status" -eq 0 ]
  [ ! -f "$lf" ] || { echo "--force hat den Lock nicht entfernt"; false; }
  cd "$BATS_TEST_DIRNAME"
  rm -rf "$wt"
}

@test "T006290: release ticket mit cwd im Worktree bleibt unveraendert [Scope-Grenze]" {
  local wt; wt="$(mktemp -d)"
  bash "$LOCK" claim ticket T006290 \
    --worktree "$wt" --label probe
  local lf="$AGENT_LOCK_DIR/ticket__T006290.json"
  [ -f "$lf" ]

  cd "$wt"
  run bash "$LOCK" release ticket T006290
  [ "$status" -eq 0 ]
  [ ! -f "$lf" ] || { echo "ticket-Release wurde vom cwd-Guard geblockt"; false; }
  cd "$BATS_TEST_DIRNAME"
  rm -rf "$wt"
}
