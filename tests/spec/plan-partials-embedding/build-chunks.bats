#!/usr/bin/env bats
# tests/spec/plan-partials-embedding/build-chunks.bats
# SSOT: openspec/changes/plan-partials-embedding/
# Verifies buildChunks() handles tasks.d/*.md as partial chunks.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TMP="$(mktemp -d)"
  # Create a minimal OpenSpec change with tasks.d/
  mkdir -p "$TMP/openspec/changes/test-slug/tasks.d" "$TMP/openspec/changes/test-slug/specs"
  printf -- '---\nticket_id: T999999\nstatus: planning\n---\n# Proposal: test\n' > "$TMP/openspec/changes/test-slug/proposal.md"
  printf -- '---\nticket_id: T999999\nstatus: planning\n---\n# Tasks: test\n\n## Partials\n\n| id | file | role | target_files | depends_on |\n|---|---|---|---|---|\n| p1 | `tasks.d/p1-impl.md` | impl | `scripts/foo.sh` | |\n| p2 | `tasks.d/p2-tests.md` | tests | `tests/spec/foo.bats` | p1 |\n' > "$TMP/openspec/changes/test-slug/tasks.md"
  printf '# Partial p1\n\n## Step 1\n\ndo thing\n' > "$TMP/openspec/changes/test-slug/tasks.d/p1-impl.md"
  printf '# Partial p2\n\n## Verify\n\nrun test\n' > "$TMP/openspec/changes/test-slug/tasks.d/p2-tests.md"
}

teardown() { rm -rf "$TMP"; }

@test "buildChunks mit tasks.d liefert partial-Chunks" {
  # Create a helper script that imports and tests buildChunks() directly
  run node --input-type=module -e "
    import { buildChunks } from '$REPO/scripts/openspec-embed.mjs';
    const files = {
      proposal: '---\n---\n# Proposal',
      tasks: '---\n---\n# Tasks\n\n## Partials\n\n| id | file | role | target_files | depends_on |\n|---|---|---|---|---|\n| p1 | tasks.d/p1.md | impl | scripts/foo.sh | |',
      partials: { 'p1-impl': '# Partial p1\n\nStep 1', 'p2-tests': '# Partial p2\n\nRun tests' },
    };
    const chunks = buildChunks(files);
    const partials = chunks.filter(c => c.fileType === 'partial');
    console.log('partial count:', partials.length);
    partials.forEach(c => console.log('partial:', c.sectionTitle, 'len:', c.text.length));
    process.exit(partials.length === 2 ? 0 : 1);
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"partial count: 2"* ]]
}

@test "buildChunks ohne tasks.d unveraendert (kein partial-Chunk)" {
  run node --input-type=module -e "
    import { buildChunks } from '$REPO/scripts/openspec-embed.mjs';
    const files = {
      proposal: '---\n---\n# Proposal',
      tasks: '---\n---\n# Tasks\n\n## Task 1\n\ndo stuff',
    };
    const chunks = buildChunks(files);
    const partials = chunks.filter(c => c.fileType === 'partial');
    console.log('partial count:', partials.length);
    process.exit(partials.length === 0 ? 0 : 1);
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"partial count: 0"* ]]
}

@test "buildChunks partial fileType ist 'partial'" {
  run grep -n "fileType: 'partial'" "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}

@test "buildChunks verarbeitet files.partials Eintraege" {
  run grep -n 'if (files.partials' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}

@test "partial-Chunk hat sectionTitle aus Dateiname" {
  run node --input-type=module -e "
    import { buildChunks } from '$REPO/scripts/openspec-embed.mjs';
    const files = { partials: { 'p1-core': '# P1\n\nContent' } };
    const chunks = buildChunks(files);
    console.log('sectionTitle:', chunks[0].sectionTitle);
    process.exit(chunks[0].sectionTitle === 'p1-core' ? 0 : 1);
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"sectionTitle: p1-core"* ]]
}
