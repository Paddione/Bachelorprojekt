#!/usr/bin/env bats
# tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats
# SSOT: openspec/specs/ci-cd.md
#
# T002671 (Befund 5): scripts/devflow-ci-watch.sh never checks whether the PR
# it is polling has already been MERGED. Its only two early-exit preflights
# guard mergeStateStatus=DIRTY and mergeable=CONFLICTING (both BEFORE CI ever
# starts); once past those, the `while true` loop's first real action is the
# BLOCKING call `gh pr checks --watch --interval 15`. Observed during T002628
# execution: after the PR auto-merged, the poll loop kept running and had to
# be killed manually — see openspec/changes/devflow-flow-frictions-T002671/proposal.md.
#
# The fix adds a `gh pr view --json state` check right after the existing
# DIRTY/CONFLICTING preflights (still before the loop) and exits 0 immediately
# (after the same assert-phase-chain call the "all green" path already runs)
# when state=MERGED — a merged PR's checks were, by branch-protection
# definition, already green, so re-polling them is pointless AND is exactly
# what hung.
#
# Verification mode: command output (CLAUDE.md Test-Resultats-Konvention) —
# a fake `gh`/`scripts/ticket.sh` pair on PATH records every subcommand it
# is invoked with; the assertions check WHICH commands actually ran, not the
# devflow-ci-watch.sh source text. The blocking call is never really made to
# hang here (a real hang cannot be asserted in a finite test run) — instead
# the marker file proves whether the script reaches the blocking call point
# at all, which is the causal reason a real `gh pr checks --watch` hangs on a
# closed PR.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO/scripts/devflow-ci-watch.sh"

  WORK="$(mktemp -d)"
  export MARKER_DIR="$WORK/markers"
  mkdir -p "$MARKER_DIR" "$WORK/bin" "$WORK/scripts"

  # Fake git repo so `git rev-parse HEAD` (only reached on the NOT-merged /
  # RED path) resolves to something.
  git -C "$WORK" init -q -b main
  git -C "$WORK" -c user.email=t@example.invalid -c user.name=t commit -q --allow-empty -m init

  cat > "$WORK/scripts/ticket.sh" <<'TICKET_EOF'
#!/usr/bin/env bash
echo "ticket.sh $*" >> "$MARKER_DIR/ticket-calls"
case "$2" in
  assert-phase-chain) exit 0 ;;
  *) exit 0 ;;
esac
TICKET_EOF
  chmod +x "$WORK/scripts/ticket.sh"

  # $1 selects which fixture state="pr_state_for_test" reports.
  cat > "$WORK/bin/gh" <<GH_EOF
#!/usr/bin/env bash
echo "gh \$*" >> "$MARKER_DIR/gh-calls"
args="\$*"
case "\$args" in
  "pr view --json number -q .number") echo 1 ;;
  *"--json mergeStateStatus"*) echo "" ;;
  *"--json mergeable "*|*"--json mergeable") echo "MERGEABLE" ;;
  *"--json state -q .state") cat "$MARKER_DIR/pr-state" 2>/dev/null || echo "OPEN" ;;
  *"checks --watch"*) touch "$MARKER_DIR/watch-called"; exit 0 ;;
  *"--json statusCheckRollup"*) echo "" ;;
  *"check-runs"*"total_count"*) echo "3" ;;
  *) echo "" ;;
esac
GH_EOF
  chmod +x "$WORK/bin/gh"
}

teardown() {
  rm -rf "$WORK"
}

# ── Positiv-Anker: the NOT-yet-merged path still reaches the blocking watch call ──#

@test "T002671: an OPEN (not yet merged) PR still reaches gh pr checks --watch (unchanged happy path)" {
  echo "OPEN" > "$MARKER_DIR/pr-state"
  run env -C "$WORK" PATH="$WORK/bin:$PATH" bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"
  [ "$status" -eq 0 ] || { echo "unerwarteter Exit $status: $output"; false; }
  [ -f "$MARKER_DIR/watch-called" ] \
    || { echo "Positiv-Anker verletzt: gh pr checks --watch wurde für eine offene PR NICHT aufgerufen — Testaufbau kaputt, nicht der Fix"; false; }
}

# ── Negativfall / Reproduktion (RED bis zum Fix) ────────────────────────────#

@test "T002671: a MERGED PR must exit 0 WITHOUT ever reaching the blocking gh pr checks --watch call" {
  echo "MERGED" > "$MARKER_DIR/pr-state"
  run env -C "$WORK" PATH="$WORK/bin:$PATH" bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"
  [ "$status" -eq 0 ] || { echo "unerwarteter Exit $status: $output"; false; }
  [ ! -f "$MARKER_DIR/watch-called" ] \
    || { echo "gh pr checks --watch WURDE für eine bereits gemergte PR aufgerufen — genau der blockierende Call, an dem der Poll-Loop nach dem Merge haengen blieb"; false; }
}
