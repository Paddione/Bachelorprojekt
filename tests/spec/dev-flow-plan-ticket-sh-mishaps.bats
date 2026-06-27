#!/usr/bin/env bats
# tests/spec/dev-flow-plan-ticket-sh-mishaps.bats
# SSOT: openspec/changes/dev-flow-plan-ticket-sh-mishaps/proposal.md
# T001242 — Mishap-Bundle (3 Einträge).
#
# Consolidates the failing-test contract for all three mishaps in the bundle.
# Each test must FAIL on the current `fix/t001242-dev-flow-plan-ticket-sh-mishaps`
# branch and PASS after the corresponding fix lands:
#
#   M1 — dev-flow-plan SKILL.md Step 3.7 prompt lists plan-lint hard rules
#   M2 — scripts/openspec.sh propose seeds a plan-lint-PASS tasks.md skeleton
#   M3 — scripts/ticket.sh cluster-write subcommands respect TICKET_OFFLINE=1
#
# Test pattern follows tests/spec/openspec-workflow.bats (one .bats per spec).
# Setup is hermetic: TICKET_OFFLINE=1 + OPENSPEC_ROOT=tmpdir so no cluster is
# touched and no other change folder is polluted.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TMP="$(mktemp -d)"
  export OPENSPEC_ROOT="$TMP/openspec"
  export TICKET_OFFLINE=1
  mkdir -p "$OPENSPEC_ROOT"
}

teardown() { rm -rf "$TMP"; }

# ── M1: dev-flow-plan SKILL.md Step 3.7 subagent-prompt hard rules ──────#
# Extract the Step 3.7 block (header through next H3 of equal-or-higher
# rank) and assert it enumerates the plan-lint hard rules so a fresh
# subagent does not have to guess them.

_step37_block() {
  # From "# Schritt 3.7" up to (but not including) the next "### Schritt" or
  # "## " line. We use awk for line-precise slicing.
  awk '
    /^### Schritt 3\.7/ { capture = 1; print; next }
    capture && /^### /   { exit }
    capture && /^## /    { exit }
    capture              { print }
  ' "$REPO/.agents/skills/dev-flow-plan/SKILL.md"
}

@test "M1: dev-flow-plan SKILL.md step 3.7 prompt mentions the F1 frontmatter key 'title'" {
  block="$(_step37_block)"
  echo "$block" | grep -Eq '\btitle\b' || { echo "MISSING title key in Step 3.7 prompt"; return 1; }
}

@test "M1: dev-flow-plan SKILL.md step 3.7 prompt mentions the F1 frontmatter key 'ticket_id'" {
  block="$(_step37_block)"
  echo "$block" | grep -Eq '\bticket_id\b' || { echo "MISSING ticket_id key in Step 3.7 prompt"; return 1; }
}

@test "M1: dev-flow-plan SKILL.md step 3.7 prompt mentions the F1 frontmatter key 'domains'" {
  block="$(_step37_block)"
  echo "$block" | grep -Eq '\bdomains\b' || { echo "MISSING domains key in Step 3.7 prompt"; return 1; }
}

@test "M1: dev-flow-plan SKILL.md step 3.7 prompt mentions the F1 frontmatter key 'status'" {
  block="$(_step37_block)"
  echo "$block" | grep -Eq '\bstatus\b' || { echo "MISSING status key in Step 3.7 prompt"; return 1; }
}

@test "M1: dev-flow-plan SKILL.md step 3.7 prompt requires the '## File Structure' section" {
  block="$(_step37_block)"
  echo "$block" | grep -Eq 'File Structure' || { echo "MISSING 'File Structure' requirement in Step 3.7 prompt"; return 1; }
}

@test "M1: dev-flow-plan SKILL.md step 3.7 prompt requires a failing-test step with the 'expected: FAIL' phrase" {
  block="$(_step37_block)"
  # The plan-lint STRUCT2 regex matches `expected:? *fail` (case-insensitive).
  # We require the author-side phrase to appear verbatim in the prompt.
  echo "$block" | grep -Eqi 'expected: *FAIL|expected:? *fail' || {
    echo "MISSING 'expected: FAIL' phrase in Step 3.7 prompt"
    return 1
  }
}

@test "M1: dev-flow-plan SKILL.md step 3.7 prompt forbids open placeholders (TBD/TODO/FIXME) in plan prose" {
  block="$(_step37_block)"
  # The P1 rule strips fenced code blocks + inline code, then bans TBD/TODO/FIXME
  # in the remaining prose. The prompt must warn the author about this.
  echo "$block" | grep -Eqi 'TBD|TODO|FIXME' || {
    echo "MISSING TBD/TODO/FIXME placeholder warning in Step 3.7 prompt"
    return 1
  }
}

@test "M1: dev-flow-plan SKILL.md step 3.7 prompt requires 'task test:changed' in the verify task" {
  block="$(_step37_block)"
  echo "$block" | grep -Eq 'task[[:space:]]+test:changed' || {
    echo "MISSING 'task test:changed' requirement in Step 3.7 prompt"
    return 1
  }
}

@test "M1: dev-flow-plan SKILL.md step 3.7 prompt requires 'task freshness:regenerate' in the verify task" {
  block="$(_step37_block)"
  echo "$block" | grep -Eq 'task[[:space:]]+freshness:regenerate' || {
    echo "MISSING 'task freshness:regenerate' requirement in Step 3.7 prompt"
    return 1
  }
}

@test "M1: dev-flow-plan SKILL.md step 3.7 prompt requires 'task freshness:check' in the verify task" {
  block="$(_step37_block)"
  echo "$block" | grep -Eq 'task[[:space:]]+freshness:check' || {
    echo "MISSING 'task freshness:check' requirement in Step 3.7 prompt"
    return 1
  }
}

# ── M2: openspec.sh propose seeds a plan-lint-PASS tasks.md skeleton ───#
# The seeded tasks.md must already pass `bash scripts/plan-lint.sh` so that
# `dev-flow-execute` step 6 (apply) does not need a manual repair round.
# F2 (`domains`) is satisfied with a non-empty default list.

@test "M2: scripts/openspec.sh propose creates the change folder" {
  run bash "$REPO/scripts/openspec.sh" propose m2-fixture --ticket T000099
  [ "$status" -eq 0 ]
  [ -d "$OPENSPEC_ROOT/changes/m2-fixture" ]
  [ -f "$OPENSPEC_ROOT/changes/m2-fixture/tasks.md" ]
}

@test "M2: scripts/openspec.sh propose seeds tasks.md with YAML frontmatter (F1)" {
  run bash "$REPO/scripts/openspec.sh" propose m2-fm --ticket T000099
  [ "$status" -eq 0 ]
  local f="$OPENSPEC_ROOT/changes/m2-fm/tasks.md"
  # F1 requires the four keys. Use grep on the first '--- … ---' block.
  head -20 "$f" | grep -Eq '^title:'         || { echo "MISSING title:";        return 1; }
  head -20 "$f" | grep -Eq '^ticket_id:'     || { echo "MISSING ticket_id:";    return 1; }
  head -20 "$f" | grep -Eq '^domains:'       || { echo "MISSING domains:";      return 1; }
  head -20 "$f" | grep -Eq '^status:'        || { echo "MISSING status:";       return 1; }
}

@test "M2: scripts/openspec.sh propose seeds tasks.md with non-empty 'domains' (F2)" {
  run bash "$REPO/scripts/openspec.sh" propose m2-dom --ticket T000099
  [ "$status" -eq 0 ]
  local f="$OPENSPEC_ROOT/changes/m2-dom/tasks.md"
  # F2: domains must be a non-empty list. We grep the inline array form
  # `[a, b, …]`; the linter regex permits whitespace-stripped `[…]`-shape.
  grep -Eq '^domains:[[:space:]]*\[[^]]+\]' "$f" || {
    echo "MISSING non-empty 'domains: [a, b, …]' frontmatter in:"
    sed -n '1,10p' "$f"
    return 1
  }
}

@test "M2: scripts/openspec.sh propose seeds tasks.md with '# <slug> — Implementation Plan' H1 (STRUCT1)" {
  run bash "$REPO/scripts/openspec.sh" propose m2-h1 --ticket T000099
  [ "$status" -eq 0 ]
  local f="$OPENSPEC_ROOT/changes/m2-h1/tasks.md"
  grep -Eq '^#.*Implementation Plan' "$f" || {
    echo "MISSING '# <slug> — Implementation Plan' H1 in:"
    sed -n '1,10p' "$f"
    return 1
  }
}

@test "M2: scripts/openspec.sh propose seeds tasks.md with a '## File Structure' section (STRUCT1)" {
  run bash "$REPO/scripts/openspec.sh" propose m2-fs --ticket T000099
  [ "$status" -eq 0 ]
  local f="$OPENSPEC_ROOT/changes/m2-fs/tasks.md"
  grep -Eqi '^#+ +File Structure' "$f" || {
    echo "MISSING '## File Structure' section in:"
    cat "$f"
    return 1
  }
}

@test "M2: scripts/openspec.sh propose seeds tasks.md with a failing-test step (STRUCT2)" {
  run bash "$REPO/scripts/openspec.sh" propose m2-fail --ticket T000099
  [ "$status" -eq 0 ]
  local f="$OPENSPEC_ROOT/changes/m2-fail/tasks.md"
  # STRUCT2 regex: `expected:? *fail` (case-insensitive) OR
  # `verify (it|test).*fail` OR `to verify (it|they) fail`.
  grep -Eqi 'expected:? *fail|verify (it|test).*fail|to verify (it|they) fail' "$f" || {
    echo "MISSING failing-test step in:"
    cat "$f"
    return 1
  }
}

@test "M2: scripts/openspec.sh propose seeds tasks.md with the three verify-task gates (STRUCT3)" {
  run bash "$REPO/scripts/openspec.sh" propose m2-gates --ticket T000099
  [ "$status" -eq 0 ]
  local f="$OPENSPEC_ROOT/changes/m2-gates/tasks.md"
  grep -Eq 'task[[:space:]]+test:changed'          "$f" || { echo "MISSING task test:changed";          return 1; }
  grep -Eq 'task[[:space:]]+freshness:regenerate'  "$f" || { echo "MISSING task freshness:regenerate";  return 1; }
  grep -Eq 'task[[:space:]]+freshness:check'       "$f" || { echo "MISSING task freshness:check";       return 1; }
}

@test "M2: scripts/openspec.sh propose seed passes scripts/plan-lint.sh end-to-end" {
  run bash "$REPO/scripts/openspec.sh" propose m2-pass --ticket T000099
  [ "$status" -eq 0 ]
  local f="$OPENSPEC_ROOT/changes/m2-pass/tasks.md"
  run bash "$REPO/scripts/plan-lint.sh" "$f"
  [ "$status" -eq 0 ] || {
    echo "plan-lint FAILED on seeded tasks.md:"
    echo "$output"
    echo "--- tasks.md ---"
    cat "$f"
    return 1
  }
}

# ── M3: scripts/ticket.sh cluster-write subcommands respect TICKET_OFFLINE ──#
# All subcommands that hit the cluster for a write (archive-plan, phase,
# set-touched-files, set-pipeline-slot, set-scout-drift, update-status,
# add-comment, add-pr-link, inject) must:
#   (a) exit 0 in TICKET_OFFLINE=1 mode, and
#   (b) emit a recognizable OFFLINE marker on stdout
# so that the dev-flow-execute `|| true` fallback contract holds.
# Read subcommands (get, get-attachments, list, get-injections) must
# STILL fail loudly in offline mode (the flow needs the cluster for
# state validation).

@test "M3: scripts/ticket.sh archive-plan respects TICKET_OFFLINE=1 (no cluster call, exit 0)" {
  # Empty plan file is fine: with the OFFLINE guard the cluster call is
  # skipped before the empty-file check trips. Either way the guard must
  # run first so the operator gets the OFFLINE marker, not a 'plan file
  # not found' error.
  local plan
  plan="$(mktemp)"
  echo '# skeleton' > "$plan"
  run bash -c "TICKET_OFFLINE=1 bash '$REPO/scripts/ticket.sh' archive-plan --id T000099 --slug m3 --branch fix/m3 --plan-file '$plan'"
  rm -f "$plan"
  [ "$status" -eq 0 ] || { echo "exit=$status, output=$output"; return 1; }
  [[ "$output" == *"OFFLINE"* ]] || { echo "MISSING OFFLINE marker in: $output"; return 1; }
}

@test "M3: scripts/ticket.sh phase respects TICKET_OFFLINE=1 (no cluster call, exit 0)" {
  run bash -c "TICKET_OFFLINE=1 bash '$REPO/scripts/ticket.sh' phase T000099 scout entered --driver devflow"
  [ "$status" -eq 0 ] || { echo "exit=$status, output=$output"; return 1; }
  [[ "$output" == *"OFFLINE"* ]] || { echo "MISSING OFFLINE marker in: $output"; return 1; }
}

@test "M3: scripts/ticket.sh set-touched-files respects TICKET_OFFLINE=1 (exit 0)" {
  run bash -c "TICKET_OFFLINE=1 bash '$REPO/scripts/ticket.sh' set-touched-files --id T000099 --files foo,bar"
  [ "$status" -eq 0 ] || { echo "exit=$status, output=$output"; return 1; }
  [[ "$output" == *"OFFLINE"* ]] || { echo "MISSING OFFLINE marker in: $output"; return 1; }
}

@test "M3: scripts/ticket.sh set-pipeline-slot respects TICKET_OFFLINE=1 (exit 0)" {
  run bash -c "TICKET_OFFLINE=1 bash '$REPO/scripts/ticket.sh' set-pipeline-slot --id T000099 --slot 1"
  [ "$status" -eq 0 ] || { echo "exit=$status, output=$output"; return 1; }
  [[ "$output" == *"OFFLINE"* ]] || { echo "MISSING OFFLINE marker in: $output"; return 1; }
}

@test "M3: scripts/ticket.sh set-scout-drift respects TICKET_OFFLINE=1 (exit 0)" {
  run bash -c "TICKET_OFFLINE=1 bash '$REPO/scripts/ticket.sh' set-scout-drift --id T000099 --drift 0.42"
  [ "$status" -eq 0 ] || { echo "exit=$status, output=$output"; return 1; }
  [[ "$output" == *"OFFLINE"* ]] || { echo "MISSING OFFLINE marker in: $output"; return 1; }
}

@test "M3: scripts/ticket.sh update-status respects TICKET_OFFLINE=1 (exit 0)" {
  run bash -c "TICKET_OFFLINE=1 bash '$REPO/scripts/ticket.sh' update-status --id T000099 --status in_progress"
  [ "$status" -eq 0 ] || { echo "exit=$status, output=$output"; return 1; }
  [[ "$output" == *"OFFLINE"* ]] || { echo "MISSING OFFLINE marker in: $output"; return 1; }
}

@test "M3: scripts/ticket.sh add-comment respects TICKET_OFFLINE=1 (exit 0)" {
  run bash -c "TICKET_OFFLINE=1 bash '$REPO/scripts/ticket.sh' add-comment --id T000099 --body 'test'"
  [ "$status" -eq 0 ] || { echo "exit=$status, output=$output"; return 1; }
  [[ "$output" == *"OFFLINE"* ]] || { echo "MISSING OFFLINE marker in: $output"; return 1; }
}

@test "M3: scripts/ticket.sh add-pr-link respects TICKET_OFFLINE=1 (exit 0)" {
  run bash -c "TICKET_OFFLINE=1 bash '$REPO/scripts/ticket.sh' add-pr-link --id T000099 --pr 1234"
  [ "$status" -eq 0 ] || { echo "exit=$status, output=$output"; return 1; }
  [[ "$output" == *"OFFLINE"* ]] || { echo "MISSING OFFLINE marker in: $output"; return 1; }
}

@test "M3: scripts/ticket.sh inject respects TICKET_OFFLINE=1 (exit 0)" {
  run bash -c "TICKET_OFFLINE=1 bash '$REPO/scripts/ticket.sh' inject --id T000099 --kind note --content 'hi'"
  [ "$status" -eq 0 ] || { echo "exit=$status, output=$output"; return 1; }
  [[ "$output" == *"OFFLINE"* ]] || { echo "MISSING OFFLINE marker in: $output"; return 1; }
}

# Reads must STILL fail in TICKET_OFFLINE=1 — the dev-flow-execute read chain
# needs the cluster to validate ticket state. The OFFLINE guard must not
# silently mask a missing cluster.

@test "M3: scripts/ticket.sh get STILL fails loudly in TICKET_OFFLINE=1 (reads require cluster)" {
  run bash -c "TICKET_OFFLINE=1 bash '$REPO/scripts/ticket.sh' get --id T000099"
  # Either non-zero exit OR an explicit 'OFFLINE reads not allowed' / similar
  # marker that tells the operator the read was refused on purpose. The point
  # is: a silent PASS that returns empty would be wrong.
  if [ "$status" -eq 0 ]; then
    [[ "$output" == *"OFFLINE"* ]] || {
      echo "ticket.sh get exited 0 in OFFLINE mode WITHOUT an OFFLINE marker — silent cluster skip is forbidden"
      return 1
    }
  fi
  # We allow either path: non-zero exit OR explicit OFFLINE marker on PASS.
  return 0
}
