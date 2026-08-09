#!/usr/bin/env bats
# tests/spec/factory-reclaim-lock-respect/worktree-reaper-lock-guard-T002896.bats
# SSOT: openspec/specs/factory-reclaim-lock-respect.md
# Ticket: T002896 — Factory-Autopilot entfernt aktiv geclaimte Fremd-Worktrees.
#
# PRUEFMODUS: Output-Verifikation. Ein echtes Bare-Origin + Klon-Repo wird
# gebaut, ein Worktree per `scripts/worktree-create.sh` angelegt, ein
# agent-lock-Claim fuer dessen Branch geschrieben, und dann der jeweilige
# Reap-Pfad (`worktree-create.sh` erneut auf denselben Zielpfad,
# `scripts/factory/cleanup.sh`) als Kommando ausgefuehrt. Geprueft wird die
# tatsaechliche Existenz von Worktree/Branch danach — kein Source-Grep.
#
# Jeder Negativtest ("wird NICHT entfernt") traegt einen Positiv-Anker im
# selben Test bzw. als Nachbartest ("wird SEHR WOHL entfernt", wenn kein Lock
# vorliegt) — sonst waere der Test vakuos, wenn die Guard-Implementierung
# fehlt (T002356-M1).
#
# RED-Erwartung: `agent-lock.sh check-branch-live` existiert noch nicht,
# `worktree-create.sh` prueft an der Idempotency-Remove-Zeile keinen Lock, und
# `cleanup.sh` prueft vor dem Removal keinen Lock. Alle drei Negativtests
# schlagen fehl (der bestehende Worktree/Branch wird trotz live Claim
# entfernt), bis der Fix-Plan implementiert ist.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  AGENT_LOCK="$REPO_ROOT/scripts/agent-lock.sh"
  WT_CREATE="$REPO_ROOT/scripts/worktree-create.sh"
  CLEANUP="$REPO_ROOT/scripts/factory/cleanup.sh"

  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"
  export AGENT_LOCK_FAKE_ALIVE=""

  ORIGIN="${BATS_TEST_TMPDIR}/origin.git"
  MAIN="${BATS_TEST_TMPDIR}/main-checkout"

  git init -q --bare -b main "$ORIGIN"
  git clone -q "$ORIGIN" "$MAIN"
  cd "$MAIN" || return 1
  git config user.email "test@example.invalid"
  git config user.name "Test"
  git config commit.gpgsign false
  echo "base" > README.md
  git add README.md
  git commit -qm "base"
  git branch -M main
  git push -q origin main
  git fetch -q origin
}

# Schreibt einen branch-scoped Lock, live per echtem $$ (dem Bats-Testprozess,
# der waehrend des gesamten Tests lebt) — dieselbe Isolation wie
# tests/spec/factory-reclaim-lock-respect.bats.
_mk_branch_lock() {  # <branch> <worktree-path>
  local br="$1" wt="$2" safe ts
  safe="$(printf '%s' "$br" | tr '/ ' '--')"
  ts=$(date +%s)
  cat > "$AGENT_LOCK_DIR/branch__${safe}.json" <<EOF
{
  "scope": "branch",
  "id": "$br",
  "owner_sid": "foreign-session-uuid",
  "owner_pid": "$$",
  "tool": "claude",
  "label": "dev-flow-plan",
  "worktree": "$wt",
  "branch": "$br",
  "ticket": "",
  "host": "testhost",
  "created_at": "$ts",
  "heartbeat_at": "$ts"
}
EOF
}

# ─────────────────────────────────────────────────────────────────────────────
# agent-lock.sh check-branch-live — neue oeffentliche Primitive
# ─────────────────────────────────────────────────────────────────────────────

@test "T002896: check-branch-live meldet 'live' fuer einen Branch mit lebendem Claim" {
  _mk_branch_lock "fix/demo-checklive-T000001" "$MAIN"
  run bash "$AGENT_LOCK" check-branch-live "fix/demo-checklive-T000001"
  [ "$status" -eq 0 ]
  [[ "$output" == *"live"* ]]
}

@test "T002896: check-branch-live meldet 'free' fuer einen Branch ohne Claim (Positiv-Anker)" {
  run bash "$AGENT_LOCK" check-branch-live "fix/demo-checklive-nonexistent-T000002"
  [ "$status" -ne 0 ]
  [[ "$output" == *"free"* ]]
}

# ─────────────────────────────────────────────────────────────────────────────
# worktree-create.sh — Idempotency-Remove darf einen live Fremd-Claim nicht
# ueberschreiben
# ─────────────────────────────────────────────────────────────────────────────

@test "T002896: worktree-create.sh loescht KEINEN Worktree mit live Fremd-Lock am Zielpfad" {
  cd "$MAIN" || return 1
  local wt1="${BATS_TEST_TMPDIR}/wt-demo1"
  run bash "$WT_CREATE" --unattended "fix/demo-collision-T000123" "$wt1"
  [ "$status" -eq 0 ]
  [ -d "$wt1" ]

  _mk_branch_lock "fix/demo-collision-T000123" "$wt1"

  # Ein zweiter Aufruf zielt auf DENSELBEN Pfad mit einem ANDEREN Branch —
  # simuliert eine race-bedingt kollidierende Factory-Anlage (T002896 Root
  # Cause: Zeile 257, unbedingtes `git worktree remove --force`).
  run bash "$WT_CREATE" --unattended "feature/demo-collision-T000123-v2" "$wt1"
  [ "$status" -ne 0 ]

  # Der urspruengliche Worktree existiert weiterhin, unveraendert auf seinem
  # Branch.
  [ -d "$wt1" ]
  run git -C "$wt1" rev-parse --abbrev-ref HEAD
  [ "$output" = "fix/demo-collision-T000123" ]
}

@test "T002896: worktree-create.sh raeumt einen Pfad OHNE Lock weiterhin idempotent (Positiv-Anker)" {
  cd "$MAIN" || return 1
  local wt2="${BATS_TEST_TMPDIR}/wt-demo2"
  run bash "$WT_CREATE" --unattended "fix/demo-nolock-T000456" "$wt2"
  [ "$status" -eq 0 ]
  [ -d "$wt2" ]

  # Kein Lock fuer fix/demo-nolock-T000456 — die Idempotency-Remove darf wie
  # bisher greifen und den Pfad fuer den neuen Branch freimachen.
  run bash "$WT_CREATE" --unattended "feature/demo-nolock-T000456-v2" "$wt2"
  [ "$status" -eq 0 ]
  [ -d "$wt2" ]
  run git -C "$wt2" rev-parse --abbrev-ref HEAD
  [ "$output" = "feature/demo-nolock-T000456-v2" ]
}

# ─────────────────────────────────────────────────────────────────────────────
# scripts/factory/cleanup.sh — skip statt Removal bei live Fremd-Lock
# ─────────────────────────────────────────────────────────────────────────────

@test "T002896: cleanup.sh entfernt Worktree+Branch NICHT bei live Fremd-Lock" {
  cd "$MAIN" || return 1
  local wt3="${BATS_TEST_TMPDIR}/wt-demo3"
  run bash "$WT_CREATE" --unattended "fix/demo-cleanup-T000321" "$wt3"
  [ "$status" -eq 0 ]
  [ -d "$wt3" ]

  _mk_branch_lock "fix/demo-cleanup-T000321" "$wt3"

  run bash "$CLEANUP" --branch "fix/demo-cleanup-T000321" --worktree "$wt3"
  [ "$status" -eq 0 ]

  [ -d "$wt3" ]
  run git -C "$MAIN" show-ref --verify --quiet "refs/heads/fix/demo-cleanup-T000321"
  [ "$status" -eq 0 ]
}

@test "T002896: cleanup.sh entfernt Worktree+Branch weiterhin OHNE Lock (Positiv-Anker)" {
  cd "$MAIN" || return 1
  local wt4="${BATS_TEST_TMPDIR}/wt-demo4"
  run bash "$WT_CREATE" --unattended "fix/demo-cleanup-nolock-T000654" "$wt4"
  [ "$status" -eq 0 ]
  [ -d "$wt4" ]

  run bash "$CLEANUP" --branch "fix/demo-cleanup-nolock-T000654" --worktree "$wt4"
  [ "$status" -eq 0 ]

  [ ! -d "$wt4" ]
  run git -C "$MAIN" show-ref --verify --quiet "refs/heads/fix/demo-cleanup-nolock-T000654"
  [ "$status" -ne 0 ]
}
