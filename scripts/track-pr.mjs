const TITLE_RE = /^(feat|fix|chore|docs|refactor|infra|perf|test|build|ci|style)(\(([^)]+)\))?(!)?:\s*(.+?)\s*$/i;
const BUG_RE   = /\bBR-\d{8}-\d{4}\b/g;
const REQ_RE   = /\b(FA|SA|NFA|AK|L)-\d+\b/i;

const BRAND_SCOPES = new Set(['mentolder', 'korczewski', 'kore']);

export function parsePr(pr) {
  const m = TITLE_RE.exec(pr.title);
  let category, scope, title;
  if (m) {
    category = m[1].toLowerCase();
    scope    = m[3] ? m[3].toLowerCase() : null;
    title    = m[5];
  } else {
    category = 'chore';
    scope    = null;
    title    = pr.title.trim();
  }

  const body = pr.body || '';
  const bug_refs = Array.from(new Set((body.match(BUG_RE) || [])));
  const reqMatch = REQ_RE.exec(body);
  const requirement_id = reqMatch ? reqMatch[0].toUpperCase() : null;

  let brand = null;
  if (scope && BRAND_SCOPES.has(scope)) {
    brand = scope === 'kore' ? 'korczewski' : scope;
  }

  return {
    pr_number: pr.number,
    title,
    description: body.length > 0 ? body.slice(0, 4000) : null,
    category,
    scope,
    brand,
    requirement_id,
    merged_at: pr.mergedAt,
    merged_by: pr.mergedBy?.login || null,
    bug_refs,
  };
}

export async function writeRowToDb(row, pgClient) {
  // Drop requirement_id if it doesn't exist in bachelorprojekt.requirements —
  // otherwise the FK rejects the row and the PR never lands in the timeline.
  let requirementId = row.requirement_id;
  if (requirementId) {
    const { rowCount } = await pgClient.query(
      'SELECT 1 FROM bachelorprojekt.requirements WHERE id = $1',
      [requirementId]
    );
    if (rowCount === 0) requirementId = null;
  }

  await pgClient.query(
    `INSERT INTO bachelorprojekt.features
       (pr_number, title, description, category, scope, brand,
        requirement_id, merged_at, merged_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'shipped')
     ON CONFLICT (pr_number) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       category = EXCLUDED.category,
       scope = EXCLUDED.scope,
       brand = EXCLUDED.brand,
       requirement_id = EXCLUDED.requirement_id,
       merged_at = EXCLUDED.merged_at,
       merged_by = EXCLUDED.merged_by`,
    [row.pr_number, row.title, row.description, row.category, row.scope, row.brand,
     requirementId, row.merged_at, row.merged_by]
  );

  for (const ticketId of row.bug_refs) {
    await pgClient.query(
      `UPDATE bugs.bug_tickets
         SET fixed_in_pr = $1, fixed_at = $2, status = 'archived'
       WHERE ticket_id = $3 AND (fixed_in_pr IS NULL OR fixed_in_pr <> $1)`,
      [row.pr_number, row.merged_at, ticketId]
    );
  }
}

import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode === '--pr') {
    const raw = readFileSync(0, 'utf8');
    const pr = JSON.parse(raw);
    const row = parsePr(pr);
    mkdirSync('tracking/pending', { recursive: true });
    const file = `tracking/pending/${row.pr_number}.json`;
    writeFileSync(file, JSON.stringify(row, null, 2) + '\n');
    console.log(`wrote ${file}`);
    return;
  }

  if (mode === '--backfill') {
    const raw = readFileSync(0, 'utf8');
    const prs = JSON.parse(raw);
    mkdirSync('tracking/pending', { recursive: true });
    for (const pr of prs) {
      const row = parsePr(pr);
      const file = `tracking/pending/${row.pr_number}.json`;
      writeFileSync(file, JSON.stringify(row, null, 2) + '\n');
    }
    console.log(`wrote ${prs.length} pending rows`);
    return;
  }

  if (mode === '--ingest') {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: process.env.TRACKING_DB_URL });
    await client.connect();
    let count = 0;
    const files = readdirSync('tracking/pending').filter(f => f.endsWith('.json'));
    for (const f of files) {
      const row = JSON.parse(readFileSync(join('tracking/pending', f), 'utf8'));
      try {
        await writeRowToDb(row, client);
        unlinkSync(join('tracking/pending', f));
        count++;
      } catch (e) {
        console.error(`skip ${f}: ${e.message}`);
      }
    }
    await client.end();
    console.log(`ingested ${count} rows`);
    return;
  }

  console.error('usage: track-pr.mjs --pr | --backfill | --ingest');
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
