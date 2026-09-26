#!/usr/bin/env bats
# tests/spec/plan-partials-embedding/k1-embeds.bats
# SSOT: openspec/specs/openspec-embedding.md
# Change: k1-ci-embeds [T900449]
#
# Manuelles Akzeptanzprotokoll (Stufen 2-4, kein CI-Anspruch):
# - Stufe 2: sed ... k3d/k1-embed-job.yaml | kubectl apply --dry-run=server -f - (Fleet-Kontext)
# - Stufe 3: ConfigMap erzeugen, Job k1-embed mit FULL=0 applizieren, sha-exit=0 + probe OK pruefen, Cleanup
# - Stufe 4: Merge nach main oder workflow_dispatch mit full=true (Voll-Reindex zuerst)

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "openspec-embed CLI flags --path, --source, --all-specs, --all-docs, --migrate-changes vorhanden" {
  run node "$REPO/scripts/openspec-embed.mjs" --help
  [ "$status" -eq 0 ]
  [[ "$output" =~ "--path" ]]
  [[ "$output" =~ "--source" ]]
  [[ "$output" =~ "--all-specs" ]]
  [[ "$output" =~ "--all-docs" ]]
  [[ "$output" =~ "--migrate-changes" ]]
}

@test "embedFile Specs-Pfad gegen Mocks legt specs_ssot an und loescht pro Pfad" {
  run node --input-type=module -e "
    import { embedFile } from '$REPO/scripts/openspec-embed.mjs';
    const seen = [];
    const query = async (sql, params) => {
      seen.push({ sql, params });
      if (sql.includes('SELECT id FROM knowledge.collections')) return { rows: [{ id: 7 }] };
      if (sql.includes('RETURNING id')) return { rows: [{ id: 9 }] };
      return { rows: [] };
    };
    const embed = async texts => texts.map(t => [0.1, 0.2]);
    await embedFile({ relPath: 'openspec/specs/demo.md', source: 'specs_ssot', text: '# Demo\n\nInhalt.', deps: { query, embed, log: () => {} } });
    const joined = seen.map(s => s.sql).join('\n');
    if (!joined.includes('specs_ssot') && !seen.some(s => JSON.stringify(s.params).includes('specs_ssot'))) process.exit(1);
    if (!seen.some(s => s.sql.includes('DELETE FROM knowledge.documents') && JSON.stringify(s.params).includes('openspec/specs/demo.md'))) process.exit(2);
    if (seen.filter(s => s.sql.includes('INSERT INTO knowledge.chunks')).length < 1) process.exit(3);
    console.log('embedFile OK');
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"embedFile OK"* ]]
}

@test "embedFile Docs-Pfad traegt file_hash, section_title, char_offset und md_section" {
  run node --input-type=module -e "
    import { embedFile } from '$REPO/scripts/openspec-embed.mjs';
    const seen = [];
    const query = async (sql, params) => {
      seen.push({ sql, params });
      if (sql.includes('SELECT id FROM knowledge.collections')) return { rows: [{ id: 7 }] };
      if (sql.includes('RETURNING id')) return { rows: [{ id: 9 }] };
      return { rows: [] };
    };
    const embed = async texts => texts.map(t => [0.1, 0.2]);
    await embedFile({ relPath: 'docs/adr/demo.md', source: 'docs', text: '# ADR\n\nEntscheidung.', deps: { query, embed, log: () => {} } });
    const docInsert = seen.find(s => s.sql.includes('INSERT INTO knowledge.documents'));
    if (!docInsert) process.exit(1);
    const docMeta = JSON.parse(docInsert.params[4]);
    if (docMeta.path !== 'docs/adr/demo.md' || docMeta.source !== 'docs' || typeof docMeta.file_hash !== 'string' || docMeta.file_hash.length !== 64) process.exit(2);
    const chunkInsert = seen.find(s => s.sql.includes('INSERT INTO knowledge.chunks'));
    if (!chunkInsert) process.exit(3);
    const chunkMeta = JSON.parse(chunkInsert.params[5]);
    if (chunkMeta.file_type !== 'md_section' || typeof chunkMeta.section_title !== 'string' || !Number.isInteger(chunkMeta.char_offset)) process.exit(4);
    console.log('embedFile Docs OK');
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"embedFile Docs OK"* ]]
}

@test "embedFile mit unbekannter Source loggt Warnung und schreibt nichts" {
  run node --input-type=module -e "
    import { embedFile } from '$REPO/scripts/openspec-embed.mjs';
    const seen = [];
    const query = async (sql, params) => { seen.push({ sql, params }); return { rows: [] }; };
    const embed = async texts => texts.map(() => [0.1]);
    let warned = false;
    const log = msg => { if (msg.includes('WARN')) warned = true; };
    await embedFile({ relPath: 'foo.md', source: 'unbekannt', text: 'Text', deps: { query, embed, log } });
    if (!warned) process.exit(1);
    if (seen.some(s => s.sql.includes('INSERT INTO'))) process.exit(2);
    console.log('unknown source OK');
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"unknown source OK"* ]]
}

@test "migrateChanges ueberspringt unveraenderte Slugs via Hash-Skip" {
  run node --input-type=module -e "
    import { migrateChanges } from '$REPO/scripts/openspec-embed.mjs';
    let embedded = [];
    const store = {};
    const query = async (sql, params) => {
      if (sql.includes('SELECT id FROM knowledge.collections')) return { rows: [{ id: 7 }] };
      if (sql.includes('RETURNING id')) return { rows: [{ id: 9 }] };
      return { rows: [] };
    };
    const deps = { query, embed: async texts => texts.map(() => [0.1]), log: () => {}, hashStore: store, recordEmbed: s => embedded.push(s) };
    await migrateChanges({ slugs: ['a', 'b'], repoRoot: '.', batch: 25, deps });
    if (embedded.length !== 2) process.exit(1);
    embedded = [];
    await migrateChanges({ slugs: ['a', 'b'], repoRoot: '.', batch: 25, deps });
    if (embedded.length !== 0) process.exit(2);
    console.log('migrate OK');
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"migrate OK"* ]]
}

@test "openspec-embed enthaelt SOURCE_DEFS und flache Quellen-Globs" {
  run grep -c 'openspec/specs/\*.md' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c 'docs/adr/\*.md' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c 'docs/runbooks/\*.md' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c 'SOURCE_DEFS' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "Workflow-YAML .github/workflows/k1-embed.yml ist valide" {
  [ -n "$(command -v yq)" ] || skip 'yq fehlt'
  run yq eval '.' "$REPO/.github/workflows/k1-embed.yml"
  [ "$status" -eq 0 ]
  echo "yaml OK"
}

@test "Job-YAML k3d/k1-embed-job.yaml ist valide" {
  [ -n "$(command -v yq)" ] || skip 'yq fehlt'
  run yq eval '.' "$REPO/k3d/k1-embed-job.yaml"
  [ "$status" -eq 0 ]
  echo "yaml OK"
}

@test "Workflow enthaelt fetch-depth, FLEET_KUBECONFIG und Job-Referenz ohne Credentials" {
  run grep -c "fetch-depth: 2" "$REPO/.github/workflows/k1-embed.yml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c "FLEET_KUBECONFIG" "$REPO/.github/workflows/k1-embed.yml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c "k3d/k1-embed-job.yaml" "$REPO/.github/workflows/k1-embed.yml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -rnE "DATABASE_URL|PGPASSWORD|WEBSITE_DB" "$REPO/.github/workflows/k1-embed.yml"
  [ "$status" -eq 1 ]
  run grep -rnE "setup-node|npm ci|npm install" "$REPO/.github/workflows/k1-embed.yml"
  [ "$status" -eq 1 ]
}

@test "Job-YAML traegt Laufzeitgrenzen, NonRoot und Digest-Pins ohne Brand-Domains" {
  run grep -c "restartPolicy: OnFailure" "$REPO/k3d/k1-embed-job.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c "ttlSecondsAfterFinished: 3600" "$REPO/k3d/k1-embed-job.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c "activeDeadlineSeconds: 5400" "$REPO/k3d/k1-embed-job.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c "automountServiceAccountToken: false" "$REPO/k3d/k1-embed-job.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c "node:22-alpine@sha256:" "$REPO/k3d/k1-embed-job.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -rnE "mentolder\.de|korczewski\.de" "$REPO/k3d/k1-embed-job.yaml"
  [ "$status" -eq 1 ]
}

@test "Job-YAML besteht Client-Dry-Run via sed-Substitution" {
  [ -n "$(command -v kubectl)" ] || skip 'kubectl fehlt'
  export JOB_ID=abc1234-999 FULL=0 MERGE_SHA=abc1234def5678 REPO_URL=https://example.invalid/x.git
  run bash -c "sed -e \"s/\\\$JOB_ID/$JOB_ID/g\" -e \"s/\\\$MERGE_SHA/$MERGE_SHA/g\" -e \"s/\\\$FULL/$FULL/g\" -e \"s|\\\$REPO_URL|$REPO_URL|g\" '$REPO/k3d/k1-embed-job.yaml' | kubectl apply --dry-run=client -f -"
  [ "$status" -eq 0 ]
  [[ "$output" == *"created"* ]] || [[ "$output" == *"configured"* ]]
}

@test "Frische-Spot-Check ueber Cosinus-Aehnlichkeit gegen echte DB" {
  [ -n "${SESSIONS_DATABASE_URL:-}" ] || skip 'keine DB-URL'
  run node --input-type=module -e "
    import pg from 'pg';
    import { defaultEmbed } from '$REPO/scripts/openspec-embed.mjs';
    const pool = new pg.Pool({ connectionString: process.env.SESSIONS_DATABASE_URL, connectionTimeoutMillis: 3000 });
    try {
      await pool.query('SELECT 1');
    } catch (_) {
      await pool.end();
      process.exit(77);
    }
    const probe = process.env.FRESH_PROBE || 'FRESH-PROBE-SATZ';
    const [vec] = await defaultEmbed([probe]);
    const lit = '[' + vec.join(',') + ']';
    const r = await pool.query(
      \"SELECT c.metadata->>'path' AS p, c.metadata->>'slug' AS s FROM knowledge.chunks c JOIN knowledge.collections k ON k.id = c.collection_id WHERE k.source IN ('specs_ssot','docs','specs_plans') ORDER BY c.embedding <=> \$1 LIMIT 1\",
      [lit]
    );
    console.log('top-hit:', JSON.stringify(r.rows[0]));
    await pool.end();
    if (!r.rows[0] || (!r.rows[0].p && !r.rows[0].s)) process.exit(1);
    process.exit(0);
  "
  if [ "$status" -eq 77 ]; then skip "DB nicht erreichbar"; fi
  [ "$status" -eq 0 ]
}
