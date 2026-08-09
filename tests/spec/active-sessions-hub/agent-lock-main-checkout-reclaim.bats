#!/usr/bin/env bats
# tests/spec/active-sessions-hub/agent-lock-main-checkout-reclaim.bats
# SSOT: openspec/specs/active-sessions-hub.md
#
# T002809: a `main-checkout` lock left as auto-claimed bookkeeping
# (label `auto: pre-commit self-claim`, written by `_self_claim_main_checkout`
# on every commit) records the COMMITTING session's SID. A LATER session with
# a DIFFERENT SID (e.g. a fresh subagent dispatch continuing the same
# operator's work) could never take it over — `cmd_claim` refuses to
# overwrite a lock held by another live SID without `--force`, and
# `cmd_guard_postcheckout` only skips its revert when `owner_sid` matches the
# CURRENT session's SID (scripts/agent-lock-guards.sh). The result: a
# legitimate branch switch by the new session got silently reverted
# (observed 2026-08-09, see openspec/changes/agent-lock-main-checkout-reclaim/proposal.md
# for the verified reproduction).
#
# `reclaim-main-checkout` lets the CURRENT session deliberately take over
# ONLY a bookkeeping-labelled lock — a DELIBERATE foreign claim (any other
# label) stays protected, unchanged.
#
# Verification mode: command output / real checkout state (CLAUDE.md
# Test-Resultats-Konvention "Output- statt Source-Verifikation") — every
# assertion below runs `agent-lock.sh` (or `git`) and checks its actual exit
# status / the actual branch HEAD lands on / the actual lock file content.
# No assertion greps scripts/agent-lock.sh or scripts/agent-lock-guards.sh.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  ALD="$(mktemp -d)"
  TR="$(mktemp -d)"
  export AGENT_LOCK_DIR="$ALD"
  git -C "$TR" init -q -b main
  git -C "$TR" -c user.email=t@example.invalid -c user.name=t commit -q --allow-empty -m init
  git -C "$TR" checkout -q -b fix/old-branch
  git -C "$TR" -c user.email=t@example.invalid -c user.name=t commit -q --allow-empty -m work
}

teardown() {
  rm -rf "$ALD" "$TR"
}

# ── Positiv-Anker + Reproduktion des Mishaps ────────────────────────────#

@test "T002809: reclaim-main-checkout lets a new session take over a bookkeeping lock, and the next checkout is not reverted" {
  # Session A self-claims (bookkeeping) while HEAD is on fix/old-branch — this
  # mirrors what .githooks/pre-commit does on every commit via
  # _self_claim_main_checkout.
  AGENT_LOCK_SID="session-A" bash -c \
    "cd '$TR' && bash '$LOCK' claim main-checkout '' --branch fix/old-branch --label 'auto: pre-commit self-claim'"
  [ -f "$ALD/main-checkout.json" ]

  # Session B — a different SID, e.g. a fresh subagent dispatch of the same
  # operator's work — explicitly reclaims before switching away from main.
  run env AGENT_LOCK_SID="session-B" bash -c "cd '$TR' && bash '$LOCK' reclaim-main-checkout"
  [ "$status" -eq 0 ] || { echo "reclaim-main-checkout failed: $output"; false; }

  local owner
  owner=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$ALD/main-checkout.json")
  [ "$owner" = "session-B" ] || { echo "owner_sid war '$owner' nach Reclaim, erwartet 'session-B'"; false; }

  # Session B now switches; guard-postcheckout must NOT revert, because the
  # lock's owner_sid is now session-B's own SID (the pre-existing SID-match
  # skip in cmd_guard_postcheckout takes over from here).
  git -C "$TR" checkout -q -b fix/new-branch main
  run env AGENT_LOCK_SID="session-B" bash -c "cd '$TR' && bash '$LOCK' guard-postcheckout"
  [ "$status" -eq 0 ]

  local branch_after
  branch_after="$(git -C "$TR" rev-parse --abbrev-ref HEAD)"
  [ "$branch_after" = "fix/new-branch" ] \
    || { echo "HEAD war '$branch_after', erwartet 'fix/new-branch' — Checkout wurde trotz Reclaim zurueckgesetzt"; false; }
}

# ── Negativfall MIT Positiv-Anker im selben Test [T002356-M1] ──────────#

@test "T002809: reclaim-main-checkout refuses a DELIBERATE (non-bookkeeping) foreign claim, leaving it unchanged" {
  # Positiv-Anker: ein Bookkeeping-Lock laesst sich weiterhin reklamieren.
  # Ohne diesen Anker waere der Negativfall unten vakuos: eine leere
  # Kandidatenliste (kein reklamierbarer Lock existiert je) wuerde "abgelehnt"
  # trivial erfuellen, auch wenn reclaim-main-checkout ueberhaupt nichts tut.
  AGENT_LOCK_SID="session-A" bash -c \
    "cd '$TR' && bash '$LOCK' claim main-checkout '' --branch fix/old-branch --label 'auto: pre-commit self-claim'"
  run env AGENT_LOCK_SID="session-B" bash -c "cd '$TR' && bash '$LOCK' reclaim-main-checkout"
  [ "$status" -eq 0 ] || { echo "Positiv-Anker (Bookkeeping-Reclaim) schlug fehl: $output"; false; }
  env AGENT_LOCK_SID="session-B" bash -c "cd '$TR' && bash '$LOCK' release main-checkout ''"
  [ ! -f "$ALD/main-checkout.json" ]

  # Jetzt ein DELIBERATER Fremd-Claim (z.B. dev-flow-chore's dokumentiertes
  # `claim main-checkout` mit echtem Label, statt Bookkeeping).
  AGENT_LOCK_SID="session-C" bash -c \
    "cd '$TR' && bash '$LOCK' claim main-checkout '' --branch fix/old-branch --label dev-flow-chore"
  [ -f "$ALD/main-checkout.json" ]

  run env AGENT_LOCK_SID="session-D" bash -c "cd '$TR' && bash '$LOCK' reclaim-main-checkout"
  [ "$status" -eq 1 ] || { echo "reclaim-main-checkout durfte einen deliberaten Fremd-Claim NICHT uebernehmen, output: $output"; false; }

  local owner
  owner=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$ALD/main-checkout.json")
  [ "$owner" = "session-C" ] || { echo "owner_sid war '$owner' nach abgelehntem Reclaim, erwartet unveraendert 'session-C'"; false; }

  local label
  label=$(sed -n 's/.*"label": *"\([^"]*\)".*/\1/p' "$ALD/main-checkout.json")
  [ "$label" = "dev-flow-chore" ] || { echo "label war '$label' nach abgelehntem Reclaim, erwartet unveraendert 'dev-flow-chore'"; false; }
}

@test "T002809: reclaim-main-checkout is a no-op when no lock exists or it is already owned by the current session" {
  run env AGENT_LOCK_SID="session-B" bash -c "cd '$TR' && bash '$LOCK' reclaim-main-checkout"
  [ "$status" -eq 0 ] || { echo "reclaim-main-checkout auf freien Lock schlug fehl: $output"; false; }
  [ ! -f "$ALD/main-checkout.json" ]

  AGENT_LOCK_SID="session-E" bash -c \
    "cd '$TR' && bash '$LOCK' claim main-checkout '' --branch fix/old-branch --label 'auto: pre-commit self-claim'"
  run env AGENT_LOCK_SID="session-E" bash -c "cd '$TR' && bash '$LOCK' reclaim-main-checkout"
  [ "$status" -eq 0 ] || { echo "reclaim-main-checkout auf eigenen Lock schlug fehl: $output"; false; }
  local owner
  owner=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$ALD/main-checkout.json")
  [ "$owner" = "session-E" ] || { echo "owner_sid war '$owner', erwartet unveraendert 'session-E'"; false; }
}
