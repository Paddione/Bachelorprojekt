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
    /FILES="/ { capture=1; next }
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
