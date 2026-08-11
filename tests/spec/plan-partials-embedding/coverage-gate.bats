#!/usr/bin/env bats
# tests/spec/plan-partials-embedding/coverage-gate.bats
# SSOT: openspec/changes/plan-partials-embedding/
# Verifies ACTIVE_STATUSES constant, countLocalActivePlans, and completeness gate.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TMP="$(mktemp -d)"
}

teardown() { rm -rf "$TMP"; }

@test "ACTIVE_STATUSES Konstante existiert und ist ein Array" {
  run node --input-type=module -e "
    import { ACTIVE_STATUSES } from '$REPO/scripts/openspec-embed.mjs';
    console.log('statuses:', JSON.stringify(ACTIVE_STATUSES));
    if (!Array.isArray(ACTIVE_STATUSES)) process.exit(1);
    if (ACTIVE_STATUSES.length < 2) process.exit(2);
    process.exit(0);
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *'"planning"'* ]]
  [[ "$output" == *'"plan_staged"'* ]]
}

@test "ACTIVE_STATUSES enthaelt planning und plan_staged" {
  run grep -n "ACTIVE_STATUSES" "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
  run node --input-type=module -e "
    import { ACTIVE_STATUSES } from '$REPO/scripts/openspec-embed.mjs';
    if (!ACTIVE_STATUSES.includes('planning')) process.exit(1);
    if (!ACTIVE_STATUSES.includes('plan_staged')) process.exit(2);
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "countLocalActivePlans existiert als exportierte Funktion" {
  run grep -n 'export function countLocalActivePlans' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}

@test "countLocalActivePlans zaehlt nur active-status Plaene" {
  # Set up test changes dir with mixed statuses.
  # 'printf --' ist hier PFLICHT: das Format beginnt mit '---' (YAML-Frontmatter),
  # ohne das '--' parst bash-printf es als Option und bricht mit Exit 2 ab
  # ("printf: --: invalid option"). [T002512]
  mkdir -p "$TMP/openspec/changes/plan-a" "$TMP/openspec/changes/plan-b" "$TMP/openspec/changes/plan-c" "$TMP/openspec/changes/plan-d" "$TMP/openspec/changes/archive/old-plan"
  printf -- '---\ntitle: A\nstatus: planning\n---\n# A\n\nTasks\n' > "$TMP/openspec/changes/plan-a/tasks.md"
  printf -- '---\ntitle: B\nstatus: plan_staged\n---\n# B\n\nTasks\n' > "$TMP/openspec/changes/plan-b/tasks.md"
  printf -- '---\ntitle: C\nstatus: archived\n---\n# C\n\nTasks\n' > "$TMP/openspec/changes/plan-c/tasks.md"
  printf -- '---\ntitle: D\nstatus: done\n---\n# D\n\nTasks\n' > "$TMP/openspec/changes/plan-d/tasks.md"
  # Archive subdir should be skipped
  printf -- '---\ntitle: Old\nstatus: planning\n---\n# Old\n\nTasks\n' > "$TMP/openspec/changes/archive/old-plan/tasks.md"

  run node --input-type=module -e "
    import { countLocalActivePlans } from '$REPO/scripts/openspec-embed.mjs';
    const count = countLocalActivePlans('$TMP');
    console.log('count:', count);
    // plan-a (planning) + plan-b (plan_staged) = 2; plan-c (archived) + plan-d (done) excluded
    if (count !== 2) { console.error('FAIL: expected 2 got', count); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"count: 2"* ]]
}

@test "countLocalActivePlans ohne changes-Dir gibt 0" {
  run node --input-type=module -e "
    import { countLocalActivePlans } from '$REPO/scripts/openspec-embed.mjs';
    const count = countLocalActivePlans('/nonexistent/path');
    console.log('count:', count);
    process.exit(count === 0 ? 0 : 1);
  "
  [ "$status" -eq 0 ]
}

@test "Completeness-Gate ist in embedSlug verbaut" {
  run grep -n 'completeness gate' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}

@test "--check-coverage CLI flag existiert" {
  run grep -n 'check-coverage' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}

@test "ACTIVE_STATUSES ist ein export const" {
  run grep -n 'export const ACTIVE_STATUSES' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}

@test "Taskfile backfill referenziert ACTIVE_STATUSES" {
  run grep -n 'ACTIVE_STATUSES' "$REPO/Taskfile.yml"
  [ "$status" -eq 0 ]
}

# ---- T002877: per-slug coverage statt roher Dokumentenzahl ----

@test "listLocalActivePlans existiert als exportierte Funktion" {
  run grep -n 'export function listLocalActivePlans' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}

@test "listLocalActivePlans liefert die Slug-Liste statt nur der Zahl" {
  mkdir -p "$TMP/openspec/changes/plan-a" "$TMP/openspec/changes/plan-b" "$TMP/openspec/changes/plan-c" "$TMP/openspec/changes/archive/old-plan"
  printf -- '---\ntitle: A\nstatus: planning\n---\n# A\n\nTasks\n' > "$TMP/openspec/changes/plan-a/tasks.md"
  printf -- '---\ntitle: B\nstatus: plan_staged\n---\n# B\n\nTasks\n' > "$TMP/openspec/changes/plan-b/tasks.md"
  printf -- '---\ntitle: C\nstatus: archived\n---\n# C\n\nTasks\n' > "$TMP/openspec/changes/plan-c/tasks.md"
  printf -- '---\ntitle: D\nstatus: planning\n---\n# D\n\nTasks\n' > "$TMP/openspec/changes/archive/old-plan/tasks.md"

  run node --input-type=module -e "
    import { listLocalActivePlans } from '$REPO/scripts/openspec-embed.mjs';
    const slugs = listLocalActivePlans('$TMP');
    console.log(JSON.stringify(slugs.sort()));
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"[\"plan-a\",\"plan-b\"]"* ]]
}

@test "computeCoverageGap zaehlt die fehlenden Slugs (T002877 12/57-Fall)" {
  run node --input-type=module -e "
    import { computeCoverageGap } from '$REPO/scripts/openspec-embed.mjs';
    const gap = computeCoverageGap(['a','b','c'], ['a']);
    console.log(JSON.stringify(gap));
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"\"missingCount\":2"* ]]
  [[ "$output" == *"\"missing\":[\"b\",\"c\"]"* ]]
  [[ "$output" == *"\"coverageRatio\":0.333"* ]]
}

@test "completenessGateMessage meldet WARN bei Diskrepanz ueber Toleranz" {
  run node --input-type=module -e "
    import { computeCoverageGap, completenessGateMessage } from '$REPO/scripts/openspec-embed.mjs';
    console.log(completenessGateMessage(computeCoverageGap(['a','b','c'], ['a']), 0.10));
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARN: completeness gate"* ]]
  [[ "$output" == *"b"* ]]
  [[ "$output" == *"c"* ]]
}

@test "completenessGateMessage meldet OK innerhalb der Toleranz" {
  run node --input-type=module -e "
    import { computeCoverageGap, completenessGateMessage } from '$REPO/scripts/openspec-embed.mjs';
    console.log(completenessGateMessage(computeCoverageGap(['a','b','c'], ['a','b','c']), 0.10));
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"completeness gate OK"* ]]
}

@test "OPENSPEC_EMBED_COVERAGE_TOLERANCE ist im Embed-Skript verdrahtet" {
  run grep -n 'OPENSPEC_EMBED_COVERAGE_TOLERANCE' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}
