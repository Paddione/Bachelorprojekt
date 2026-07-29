#!/usr/bin/env bats
# tests/spec/plan-partials-embedding/manifest-parser.bats
# SSOT: openspec/changes/plan-partials-embedding/
# Verifies parsePartialManifest() parses ## Partials table correctly.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "parsePartialManifest existiert als exportierte Funktion" {
  run grep -n 'export function parsePartialManifest' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}

@test "parsePartialManifest parst depends_on aus Zelle" {
  run node --input-type=module -e "
    import { parsePartialManifest } from '$REPO/scripts/openspec-embed.mjs';
    const md = '## Partials\n\n| id | file | role | target_files | depends_on |\n|---|---|---|---|---|\n| p1 | t.md | impl | scripts/a.sh | |\n| p2 | t.md | tests | scripts/b.sh | p1 |\n';
    const rows = parsePartialManifest(md);
    console.log('rows:', rows.length);
    console.log('p1 dependsOn:', JSON.stringify(rows[0].dependsOn));
    console.log('p2 dependsOn:', JSON.stringify(rows[1].dependsOn));
    // p1 has empty depends_on -> []
    if (rows[0].dependsOn.length !== 0) { console.error('FAIL: p1 dependsOn should be []'); process.exit(1); }
    // p2 depends on p1 -> ['p1']
    if (rows[1].dependsOn.length !== 1 || rows[1].dependsOn[0] !== 'p1') { console.error('FAIL: p2 dependsOn should be [\"p1\"]'); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "parsePartialManifest leere depends_on Zelle ist [], nicht ['—']" {
  run node --input-type=module -e "
    import { parsePartialManifest } from '$REPO/scripts/openspec-embed.mjs';
    const md = '## Partials\n\n| id | file | role | target_files | depends_on |\n|---|---|---|---|---|\n| p1 | t.md | impl | scripts/a.sh | |\n';
    const rows = parsePartialManifest(md);
    console.log('dependsOn:', JSON.stringify(rows[0].dependsOn));
    if (rows[0].dependsOn.length !== 0) process.exit(1);
    // Must NOT contain the em-dash placeholder
    if (JSON.stringify(rows[0].dependsOn).includes('—')) process.exit(2);
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "parsePartialManifest em-dash in depends_on wird ignoriert" {
  run node --input-type=module -e "
    import { parsePartialManifest } from '$REPO/scripts/openspec-embed.mjs';
    // Some plans use — as a visual placeholder for empty cells
    const md = '## Partials\n\n| id | file | role | target_files | depends_on |\n|---|---|---|---|---|\n| p1 | t.md | impl | scripts/a.sh | — |\n';
    const rows = parsePartialManifest(md);
    console.log('dependsOn:', JSON.stringify(rows[0].dependsOn));
    if (rows[0].dependsOn.length !== 0) process.exit(1);
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "parsePartialManifest komma-separierte depends_on" {
  run node --input-type=module -e "
    import { parsePartialManifest } from '$REPO/scripts/openspec-embed.mjs';
    const md = '## Partials\n\n| id | file | role | target_files | depends_on |\n|---|---|---|---|---|\n| p3 | t.md | tests | scripts/c.sh | p1, p2 |\n';
    const rows = parsePartialManifest(md);
    console.log('dependsOn:', JSON.stringify(rows[0].dependsOn));
    if (rows[0].dependsOn.length !== 2) process.exit(1);
    if (rows[0].dependsOn[0] !== 'p1') process.exit(2);
    if (rows[0].dependsOn[1] !== 'p2') process.exit(3);
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "parsePartialManifest target_files parsen" {
  run node --input-type=module -e "
    import { parsePartialManifest } from '$REPO/scripts/openspec-embed.mjs';
    const md = '## Partials\n\n| id | file | role | target_files | depends_on |\n|---|---|---|---|---|\n| p1 | t.md | impl | scripts/a.sh, scripts/b.sh | |\n';
    const rows = parsePartialManifest(md);
    console.log('targetFiles:', JSON.stringify(rows[0].targetFiles));
    if (rows[0].targetFiles.length !== 2) process.exit(1);
    if (rows[0].targetFiles[0] !== 'scripts/a.sh') process.exit(2);
    if (rows[0].targetFiles[1] !== 'scripts/b.sh') process.exit(3);
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}
