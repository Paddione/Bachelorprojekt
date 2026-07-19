#!/usr/bin/env bats
# tests/spec/pre-commit-freshness.bats
# SSOT: openspec/changes/pre-push-freshness-double-run/specs/ci-cd.md
# T001388: pre-commit freshness auto-stage covers all regen-produced files.
#
# Three tests:
#   (1) RED-Sanity — the two specific files missing from .githooks/pre-commit
#       auto-stage are reported (fails against main, passes after fix).
#   (2) Drift-Guard — pre-commit `_FRESHNESS_FILES` is a superset of the
#       `FILES` variable in Taskfile.yml `freshness:check` (catches future
#       drift, passes after fix).
#   (3) Auto-Stage-Smoke — verifies the hook's auto-stage loop iterates over
#       the two added entries (passes after fix; in the broken state the
#       loop simply skips them).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  HOOK="$REPO_ROOT/.githooks/pre-commit"
  TASKFILE="$REPO_ROOT/Taskfile.yml"
}

# Extract the _FRESHNESS_FILES array entries from the pre-commit hook
# (each path between `=(` and `)`, with leading whitespace stripped).
_pre_commit_files() {
  awk '
    /_FRESHNESS_FILES=\(/ { capture=1; next }
    capture && /^\)/      { capture=0; next }
    capture && /^[[:space:]]+[a-zA-Z0-9_./-]+$/ { print }
  ' "$HOOK" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' | grep -v '^$'
}

# Extract the FILES variable entries from Taskfile.yml `freshness:check`
# (the heredoc-style block indented under `- |`).
_freshness_check_files() {
  awk '
    /^[[:space:]]*FILES="/ { capture=1; next }
    capture && /"$/ { capture=0; next }
    capture { print }
  ' "$TASKFILE" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' | grep -v '^$'
}

# ── (1) RED-Sanity — the two specific files are listed in pre-commit ─────
@test "T001388: pre-commit _FRESHNESS_FILES includes openspec-status.json (RED against main)" {
  [ -f "$HOOK" ] || { echo "MISSING hook: $HOOK"; return 1; }
  _pre_commit_files | grep -qxF 'website/src/data/openspec-status.json' \
    || { echo "MISSING website/src/data/openspec-status.json from pre-commit _FRESHNESS_FILES"; return 1; }
}

@test "T001388: pre-commit _FRESHNESS_FILES includes loc-budget.json (RED against main)" {
  [ -f "$HOOK" ] || { echo "MISSING hook: $HOOK"; return 1; }
  _pre_commit_files | grep -qxF 'docs/code-quality/loc-budget.json' \
    || { echo "MISSING docs/code-quality/loc-budget.json from pre-commit _FRESHNESS_FILES"; return 1; }
}

# ── (2) Drift-Guard — pre-commit list ⊇ freshness:check list ──────────────
@test "T001388: pre-commit auto-stage list is a superset of freshness:check FILES" {
  [ -f "$HOOK" ]     || { echo "MISSING hook: $HOOK"; return 1; }
  [ -f "$TASKFILE" ] || { echo "MISSING taskfile: $TASKFILE"; return 1; }

  hook_list="$(_pre_commit_files | sort -u)"
  check_list="$(_freshness_check_files | sort -u)"

  # For each path in freshness:check, it must also appear in pre-commit.
  missing=""
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    if ! printf '%s\n' "$hook_list" | grep -qxF "$path"; then
      missing+="$path"$'\n'
    fi
  done <<< "$check_list"

  if [ -n "$missing" ]; then
    echo "DRIFT: these paths are in 'task freshness:check FILES' but NOT in '.githooks/pre-commit _FRESHNESS_FILES':"
    printf '%s' "$missing"
    echo "Fix: add the missing entries to .githooks/pre-commit's _FRESHNESS_FILES array."
    return 1
  fi
}

# ── (3) Auto-Stage-Smoke — verify the auto-stage loop variable is referenced ─
@test "T001388: pre-commit hook iterates _FRESHNESS_FILES and runs git add on each entry" {
  [ -f "$HOOK" ] || { echo "MISSING hook: $HOOK"; return 1; }
  # The loop must exist, must reference _FRESHNESS_FILES, and must call
  # `git add -- "$_f"` (or equivalent) inside the loop body.
  grep -qE 'for _f in .*_FRESHNESS_FILES' "$HOOK" \
    || { echo "MISSING 'for _f in \${_FRESHNESS_FILES[@]}' loop in $HOOK"; return 1; }
  grep -qE 'git[[:space:]]+.*add[[:space:]]+.*"\$_f"' "$HOOK" \
    || { echo "MISSING 'git add -- \"\$_f\"' inside the loop in $HOOK"; return 1; }
}

# ────────────────────────────────────────────────────────────────────────────
# T001973: post-merge / pre-commit freshness regeneration must be suppressed
# while a rebase/merge is in flight (guards against the T001973 mishap where
# `git pull --rebase` collided with hook-regenerated artifacts and produced
# an unresolvable "would be overwritten" state in the working tree).
#
# Strategy: verify the guard logic by source-inspection of the hook files
# rather than executing them in a temp-repo (the hook's own rebase-merge
# detection logic is the SUT). Drift-Guard pattern, same as the T001388
# tests above.
# ────────────────────────────────────────────────────────────────────────────

setup_t001973() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  POST_MERGE="$REPO_ROOT/.githooks/post-merge"
  PRE_COMMIT="$REPO_ROOT/.githooks/pre-commit"
}

@test "T001973: post-merge hook contains a guard that exits 0 when rebase-merge dir exists" {
  setup_t001973
  [ -f "$POST_MERGE" ] || { echo "MISSING hook: $POST_MERGE"; return 1; }
  grep -qE 'rebase-merge' "$POST_MERGE" \
    || { echo "MISSING 'rebase-merge' check in $POST_MERGE"; return 1; }
  grep -qE 'rebase-apply' "$POST_MERGE" \
    || { echo "MISSING 'rebase-apply' check in $POST_MERGE"; return 1; }
  grep -qE 'MERGE_HEAD' "$POST_MERGE" \
    || { echo "MISSING 'MERGE_HEAD' check in $POST_MERGE"; return 1; }
}

@test "T001973: post-merge hook supports FRESHNESS_HOOK_DISABLED=1 env opt-out" {
  setup_t001973
  [ -f "$POST_MERGE" ] || { echo "MISSING hook: $POST_MERGE"; return 1; }
  grep -qE 'FRESHNESS_HOOK_DISABLED' "$POST_MERGE" \
    || { echo "MISSING 'FRESHNESS_HOOK_DISABLED' env opt-out in $POST_MERGE"; return 1; }
}

@test "T001973: pre-commit hook contains a guard around the freshness auto-stage block" {
  setup_t001973
  [ -f "$PRE_COMMIT" ] || { echo "MISSING hook: $PRE_COMMIT"; return 1; }
  # The guard must be present, and it must guard the freshness:auto-stage loop
  # (not the whole hook — secret-/agent-lock-checks must still run mid-rebase).
  grep -qE 'rebase-merge' "$PRE_COMMIT" \
    || { echo "MISSING 'rebase-merge' check in $PRE_COMMIT"; return 1; }
  grep -qE 'FRESHNESS_HOOK_DISABLED' "$PRE_COMMIT" \
    || { echo "MISSING 'FRESHNESS_HOOK_DISABLED' env opt-out in $PRE_COMMIT"; return 1; }
  # Sanity: the secret-/agent-lock-Teile must NOT be inside the guard's
  # exit-0 branch (i.e. the guard must wrap ONLY the freshness block, not
  # the whole hook). We assert by checking that the guard references the
  # freshness files or 'freshness:regenerate' nearby.
  awk '/rebase-merge|FRESHNESS_HOOK_DISABLED/ { found=1; ctx=NR; next } found && NR<=ctx+15 { print NR": "$0 }' "$PRE_COMMIT" | grep -qE 'freshness:_FRESHNESS_FILES|freshness:regenerate' \
    || { echo "guard does not appear to wrap the freshness block in $PRE_COMMIT"; return 1; }
}

@test "T001973: post-merge guard exits 0 cleanly (does not abort mid-rebase) [T000581 §freshness:regenerate skip-safe]" {
  setup_t001973
  [ -f "$POST_MERGE" ] || { echo "MISSING hook: $POST_MERGE"; return 1; }
  # When the guard fires, the post-merge hook's regen/loc-budget-restore/
  # codebase-memory-reindex steps must be skipped — but the hook should not
  # emit a non-zero exit code (which would surface as "hint: using
  # post-merge hook failed" and a dirty tree). Assert via the guard syntax:
  # a clean `exit 0` (or just `exit 0` after the guard condition) must be
  # reachable. The Plan recommends `exit 0` explicitly.
  grep -qE 'rebase-merge.*exit 0|exit 0.*rebase-merge' "$POST_MERGE" \
    || grep -qE '^[[:space:]]*exit 0[[:space:]]*#.*\[T001973\]' "$POST_MERGE" \
    || { echo "guard does not appear to exit 0 cleanly in $POST_MERGE"; return 1; }
}

# Control test: pre-commit's freshness block (T001388 auto-stage) must still
# be triggered when no rebase/merge is in flight and FRESHNESS_HOOK_DISABLED
# is unset. Drift-Guard: confirms the guard does not over-suppress.
@test "T001973: pre-commit hook still calls task freshness:regenerate (control test, must stay green)" {
  setup_t001973
  [ -f "$PRE_COMMIT" ] || { echo "MISSING hook: $PRE_COMMIT"; return 1; }
  grep -qE 'task[[:space:]]+.*freshness:regenerate' "$PRE_COMMIT" \
    || { echo "MISSING 'task ... freshness:regenerate' in $PRE_COMMIT — guard over-suppressed!"; return 1; }
}
