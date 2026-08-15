#!/usr/bin/env bats
# tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats
# SSOT: openspec/specs/ci-cd.md
#
# T002671 (Befund 5): scripts/devflow-ci-watch.sh never checks whether the PR
# it is polling has already been MERGED.
#
# T003612 (2026-08-11): Drei Bugs, die zusammen eine Falsch-Grün-Meldung erzeugen:
#   1. `gh pr checks --watch` wird OHNE $PR_URL aufgerufen → watch läuft gegen cwd-PR
#   2. `git rev-parse HEAD` verwendet cwd-HEAD statt PR-headRefOid → falsches TOTAL_CHECKS
#   3. Grün-Prüfung ignoriert IN_PROGRESS-Checks → Status "alle grün" obwohl Checks noch laufen

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO/scripts/devflow-ci-watch.sh"

  WORK="$(mktemp -d)"
  export MARKER_DIR="$WORK/markers"
  mkdir -p "$MARKER_DIR" "$WORK/bin" "$WORK/scripts"

  # Default marker files (overridden by individual tests)
  echo "OPEN" > "$MARKER_DIR/pr-state"
  echo "" > "$MARKER_DIR/mock-rollup-failures"
  echo "0" > "$MARKER_DIR/mock-rollup-pending"

  # Fake git repo so `git rev-parse HEAD` (only reached on the NOT-merged /
  # RED path) resolves to something.
  git -C "$WORK" init -q -b main
  git -C "$WORK" -c user.email=t@example.invalid -c user.name=t commit -q --allow-empty -m init

  cat > "$WORK/scripts/ticket.sh" <<'TICKET_EOF'
#!/usr/bin/env bash
echo "ticket.sh $*" >> "$MARKER_DIR/ticket-calls"
case "$1" in
  assert-phase-chain) exit 0 ;;
  *) exit 0 ;;
esac
TICKET_EOF
  chmod +x "$WORK/scripts/ticket.sh"

  # Fake gh — driven by marker files under $MARKER_DIR/:
  #   pr-state              → what `gh pr view --json state` returns
  #   pr-watch-urls         → records every <url> argument passed to `gh pr checks --watch`
  #   watch-fail            → if exists, `gh pr checks --watch` exits 1
  #   mock-head-ref-oid     → what `gh pr view --json headRefOid` returns (default: WORK repo HEAD)
  #   mock-total-checks     → what `gh api .../check-runs` total_count returns (default: 3)
  #   mock-rollup-failures  → post-jq output for FAILED_CHECKS (FAILURE/TIMED_OUT match)
  #   mock-rollup-pending   → post-jq output for PENDING_COUNT (COMPLETED match)
  cat > "$WORK/bin/gh" <<GH_EOF
#!/usr/bin/env bash
echo "gh \$*" >> "$MARKER_DIR/gh-calls"
args="\$*"
case "\$args" in
  "pr view --json number -q .number") echo 1 ;;
  *"--json mergeStateStatus"*) echo "" ;;
  *"--json mergeable "*|*"--json mergeable") echo "MERGEABLE" ;;
  *"--json state -q .state") cat "$MARKER_DIR/pr-state" 2>/dev/null || echo "OPEN" ;;
  *"--json headRefOid -q .headRefOid")
    if [[ -f "$MARKER_DIR/mock-head-ref-oid" ]]; then
      cat "$MARKER_DIR/mock-head-ref-oid"
    else
      git -C "$WORK" rev-parse HEAD
    fi
    ;;
  *"pr checks"*"--watch"*)
    touch "$MARKER_DIR/watch-called"
    for a in \$@; do
      case "\$a" in
        https://*|http://*) echo "\$a" >> "$MARKER_DIR/pr-watch-urls" ;;
      esac
    done
    if [[ -f "$MARKER_DIR/watch-fail" ]]; then exit 1; fi
    exit 0
    ;;
  *"--json statusCheckRollup"*)
    # Route to the correct mock based on the jq query content
    if [[ "\$args" == *'"FAILURE"'* || "\$args" == *'"TIMED_OUT"'* ]]; then
      cat "$MARKER_DIR/mock-rollup-failures" 2>/dev/null || true
    elif [[ "\$args" == *'"COMPLETED"'* || "\$args" == *'COMPLETED'* ]]; then
      cat "$MARKER_DIR/mock-rollup-pending" 2>/dev/null || echo "0"
    else
      # Generic statusCheckRollup query (no specific keyword) — assume empty
      echo ""
    fi
    ;;
  *"check-runs"*"total_count"*)
    if [[ -f "$MARKER_DIR/mock-total-checks" ]]; then
      cat "$MARKER_DIR/mock-total-checks"
    else
      echo "3"
    fi
    ;;
  *) echo "" ;;
esac
GH_EOF
  chmod +x "$WORK/bin/gh"
}

teardown() {
  rm -rf "$WORK"
}

# ── Positiv-Anker: NOT-yet-merged path reaches the blocking watch call ──#

@test "T002671: an OPEN (not yet merged) PR still reaches gh pr checks --watch (unchanged happy path)" {
  echo "OPEN" > "$MARKER_DIR/pr-state"
  run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"
  [ "$status" -eq 0 ] || { echo "unerwarteter Exit $status: $output"; false; }
  [ -f "$MARKER_DIR/watch-called" ] \
    || { echo "Positiv-Anker verletzt: gh pr checks --watch wurde für eine offene PR NICHT aufgerufen — Testaufbau kaputt, nicht der Fix"; false; }
}

# ── Negativfall / Reproduktion (RED bis zum Fix) ────────────────────────────#

@test "T002671: a MERGED PR must exit 0 WITHOUT ever reaching the blocking gh pr checks --watch call" {
  echo "MERGED" > "$MARKER_DIR/pr-state"
  run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"
  [ "$status" -eq 0 ] || { echo "unerwarteter Exit $status: $output"; false; }
  [ ! -f "$MARKER_DIR/watch-called" ] \
    || { echo "gh pr checks --watch WURDE für eine bereits gemergte PR aufgerufen — genau der blockierende Call, an dem der Poll-Loop nach dem Merge haengen blieb"; false; }
}

# ── T003612: Bug 1 — PR_URL must be passed to `gh pr checks --watch` ────────#
# expected: FAIL (RED — Zeile 74 ruft `gh pr checks --watch` OHNE $PR_URL)

@test "T003612-a: gh pr checks --watch receives the PR_URL argument (not cwd bare call)" {
  echo "OPEN" > "$MARKER_DIR/pr-state"
  run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T999999 "https://github.com/x/y/pull/42"
  [ "$status" -eq 0 ] || { echo "unerwarteter Exit $status: $output"; false; }
  # The fake gh records the PR URL passed to checks --watch.
  # Without the fix, no URL is recorded (the call is bare `gh pr checks --watch`).
  # With the fix, the recorded URL matches the argument.
  grep -q "https://github.com/x/y/pull/42" "$MARKER_DIR/pr-watch-urls" 2>/dev/null \
    || { echo "gh pr checks --watch wurde OHNE die PR-URL aufgerufen — cwd-Rückfall, Bug 1"; false; }
}

# ── T003612: Bug 3 — IN_PROGRESS checks must not report "alle grün" ──────────#
# Reproduktion: gh pr checks --watch ohne PR_URL schlägt fehl (|| true verschluckt)
# → FAILED_CHECKS findet keine FAILURE (IN_PROGRESS hat keine conclusion)
# → Skript meldet fälschlich "alle grün" und exit 0.
# expected: FAIL (RED — der Bug existiert noch)

@test "T003612-b: IN_PROGRESS checks (status != COMPLETED) MUST NOT trigger false green exit" {
  echo "OPEN" > "$MARKER_DIR/pr-state"

  # Simulate: `gh pr checks --watch` fails (e.g. cwd has no PR) — caught by || true
  touch "$MARKER_DIR/watch-fail"

  # FAILED_CHECKS finds no FAILURE/TIMED_OUT — IN_PROGRESS has no conclusion
  echo -n "" > "$MARKER_DIR/mock-rollup-failures"

  # PENDING_COUNT: after the fix returns 1 (one check IN_PROGRESS);
  # before the fix this mock is unused (script doesn't query for pending).
  echo "1" > "$MARKER_DIR/mock-rollup-pending"

  echo "1" > "$MARKER_DIR/mock-total-checks"
  git -C "$WORK" rev-parse HEAD > "$MARKER_DIR/mock-head-ref-oid"

  run env -C "$WORK" TICKET_SH="$WORK/scripts/ticket.sh" PATH="$WORK/bin:$PATH" \
    bash "$SCRIPT" T999999 "https://github.com/x/y/pull/1"

  # RED phase: script falsely exits 0 with "alle grün" → [ "$status" -ne 0 ] FAILS
  # GREEN phase: script detects PENDING_COUNT > 0, loops until max attempts, exits 1 → PASSES
  [ "$status" -ne 0 ] \
    || { echo "❌ Bug 3 reproduziert: Script meldete 'alle grün' (exit 0) obwohl ein Check noch IN_PROGRESS war"; false; }
}
