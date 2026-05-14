const TITLE_RE = /^(feat|fix|chore|docs|refactor|infra|perf|test|build|ci|style)(\(([^)]+)\))?(!)?:\s*(.+?)\s*$/i;
const BUG_RE   = /\bBR-\d{8}-\d{4}\b/g;
const REQ_RE   = /\b(FA|SA|NFA|AK|L)-\d+\b/i;
const TICKET_RE = /\bT\d{6}\b/g;

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
  const ticket_refs = Array.from(new Set((body.match(TICKET_RE) || [])));

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
    ticket_refs,
  };
}

export async function writeRowToDb(row, pgClient) {
  // 1. Insert PR ledger row into tickets.pr_events (idempotent on pr_number).
  await pgClient.query(
    `INSERT INTO tickets.pr_events
       (pr_number, title, description, category, scope, brand,
        merged_at, merged_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'shipped')
     ON CONFLICT (pr_number) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       category = EXCLUDED.category,
       scope = EXCLUDED.scope,
       brand = EXCLUDED.brand,
       merged_at = EXCLUDED.merged_at,
       merged_by = EXCLUDED.merged_by`,
    [row.pr_number, row.title, row.description, row.category, row.scope, row.brand,
     row.merged_at, row.merged_by]
  );

  // 2. Requirement reference → tickets.ticket_links row (kind='fixes').
  // Mirrors the bug-ref pattern below: from_id=to_id=feature_ticket.id.
  if (row.requirement_id) {
    const t = await pgClient.query(
      `SELECT id FROM tickets.tickets
        WHERE type='feature' AND external_id = $1`,
      [row.requirement_id]);
    if (t.rowCount > 0) {
      await pgClient.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number)
         VALUES ($1, $1, 'fixes', $2)
         ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
        [t.rows[0].id, row.pr_number]);
    } else {
      console.log(`skip requirement link ${row.requirement_id}: feature ticket not found`);
    }
  }

  // Map external_id (BR-...) -> ticket UUID, transition through tickets.tickets.
  // We use raw SQL because track-pr.mjs runs as a Node script outside the website
  // process (so we can't import the TypeScript transitionTicket directly).
  // Reporter notification is fired via a thin internal HTTP endpoint that lives
  // inside the website pod, which has SMTP credentials in its env.
  for (const externalId of row.bug_refs) {
    const r = await pgClient.query(
      `SELECT id, status, reporter_email FROM tickets.tickets
        WHERE type = 'bug' AND external_id = $1`, [externalId]);
    if (r.rowCount === 0) {
      // Both clusters' crons process the same tracking/pending JSON files,
      // but tickets.tickets is brand-scoped (BR-IDs are minted per cluster).
      // A skip here is normal when the PR mentions a BR-ID from the other
      // cluster's brand — that link will be created on the cluster that
      // actually has the bug ticket.
      console.log(`skip ${externalId}: not on this cluster (cross-brand BR-ID)`);
      continue;
    }
    const t = r.rows[0];
    if (t.status === 'done' || t.status === 'archived') {
      // already closed — just record the link (idempotent)
      await pgClient.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number)
         VALUES ($1, $1, 'fixes', $2) ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
        [t.id, row.pr_number]);
      continue;
    }
    await pgClient.query('BEGIN');
    try {
      await pgClient.query(`SELECT set_config('app.user_label', 'github-bot', true)`);
      await pgClient.query(
        `UPDATE tickets.tickets SET status = 'done', resolution = 'fixed' WHERE id = $1`,
        [t.id]);
      await pgClient.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number)
         VALUES ($1, $1, 'fixes', $2) ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
        [t.id, row.pr_number]);
      await pgClient.query('COMMIT');
    } catch (e) {
      await pgClient.query('ROLLBACK').catch(() => {});
      throw e;
    }
    // Reporter notification — call the website API so the email pipeline runs in-process.
    if (t.reporter_email) {
      const apiUrl = process.env.WEBSITE_API_URL ?? 'https://web.mentolder.de';
      try {
        const resp = await fetch(`${apiUrl}/api/internal/tickets/notify-close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',
                     'X-Internal-Token': process.env.INTERNAL_API_TOKEN ?? '' },
          body: JSON.stringify({ externalId, resolution: 'fixed' }),
        });
        if (!resp.ok) {
          console.error(`notify-close ${externalId}: HTTP ${resp.status}`);
        }
      } catch (e) {
        console.error(`notify-close failed for ${externalId}: ${e.message}`);
      }
    }
  }
}

import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Self-heal: create tickets.pr_events if it does not exist yet. The website
// pod creates it lazily via initTicketsSchema() in website/src/lib/tickets-db.ts,
// but the tracking-import CronJob may run before any website-write path has
// fired post-deploy. DDL must stay byte-identical to tickets-db.ts.
async function ensurePrEventsSchema(pgClient) {
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS tickets.pr_events (
      pr_number    INTEGER PRIMARY KEY,
      title        TEXT NOT NULL,
      description  TEXT,
      category     TEXT NOT NULL,
      scope        TEXT,
      brand        TEXT,
      merged_at    TIMESTAMPTZ NOT NULL,
      merged_by    TEXT,
      status       TEXT NOT NULL DEFAULT 'shipped'
                   CHECK (status IN ('planned','in_progress','shipped','reverted')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS pr_events_merged_at_idx ON tickets.pr_events (merged_at DESC)`);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS pr_events_brand_idx     ON tickets.pr_events (brand) WHERE brand IS NOT NULL`);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS pr_events_category_idx  ON tickets.pr_events (category)`);
}

async function ensurePlanSchema(pgClient) {
  await pgClient.query(`CREATE SCHEMA IF NOT EXISTS superpowers`);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS superpowers.plans (
      id           SERIAL PRIMARY KEY,
      slug         TEXT NOT NULL UNIQUE,
      title        TEXT NOT NULL,
      domains      TEXT[] NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','completed','archived')),
      pr_number    INTEGER,
      file_path    TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS superpowers.plan_sections (
      id           SERIAL PRIMARY KEY,
      plan_id      INTEGER NOT NULL REFERENCES superpowers.plans(id) ON DELETE CASCADE,
      section_type TEXT NOT NULL
                   CHECK (section_type IN ('overview','architecture','tasks','files','gotchas','data-flow','other')),
      content      TEXT NOT NULL,
      seq          INTEGER NOT NULL,
      UNIQUE (plan_id, seq)
    )
  `);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS plans_domains_idx ON superpowers.plans USING GIN(domains)`);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS plans_status_idx ON superpowers.plans(status)`);
}

async function writePlanToDb(row, pgClient) {
  const result = await pgClient.query(
    `INSERT INTO superpowers.plans (slug, title, domains, status, pr_number, file_path)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title,
       domains = EXCLUDED.domains,
       status = EXCLUDED.status,
       pr_number = EXCLUDED.pr_number,
       file_path = EXCLUDED.file_path
     RETURNING id`,
    [row.slug, row.title, row.domains, row.status, row.pr_number ?? null, row.file_path]
  );
  const planId = result.rows[0].id;

  // Replace sections wholesale (simpler than diffing)
  await pgClient.query(`DELETE FROM superpowers.plan_sections WHERE plan_id = $1`, [planId]);
  for (const section of (row.sections ?? [])) {
    await pgClient.query(
      `INSERT INTO superpowers.plan_sections (plan_id, section_type, content, seq)
       VALUES ($1, $2, $3, $4)`,
      [planId, section.section_type, section.content, section.seq]
    );
  }
}

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
    await ensurePrEventsSchema(client);     // self-heal: create table before first write
    await ensurePlanSchema(client);         // self-heal: create superpowers schema/tables
    let count = 0;
    const files = readdirSync('tracking/pending').filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const raw = readFileSync(join('tracking/pending', f), 'utf8');
        if (!raw.trim()) {
          // Empty pending file — track-plans / track-pr emitter can produce these on parse failures.
          // Drop them so the rest of the batch can proceed.
          console.error(`skip ${f}: file is empty, removing`);
          unlinkSync(join('tracking/pending', f));
          continue;
        }
        const row = JSON.parse(raw);
        if (row.type === 'plan') {
          await writePlanToDb(row, client);
        } else {
          await writeRowToDb(row, client);
        }
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
