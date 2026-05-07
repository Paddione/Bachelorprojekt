// scripts/migrate-bugs-to-tickets.mjs
//
// Migrates bugs.bug_tickets → tickets.tickets (and associated tags/comments).
// Idempotent: uses the UNIQUE constraint on tickets.tickets(external_id) to
// detect already-migrated rows and skip them.
//
// Usage:
//   node scripts/migrate-bugs-to-tickets.mjs            # dry-run (default)
//   node scripts/migrate-bugs-to-tickets.mjs --apply    # execute changes
//
// Environment:
//   TRACKING_DB_URL  or  WEBSITE_DB_URL  — PostgreSQL connection string.
//   Falls back to: postgres://postgres:postgres@localhost:5432/website
import pg from 'pg';

const STATUS_MAP = {
  open:     { status: 'triage',   resolution: null    },
  resolved: { status: 'done',     resolution: 'fixed' },
  archived: { status: 'archived', resolution: 'fixed' },
};

const CATEGORY_TAG = {
  fehler:             'kind:bug',
  verbesserung:       'kind:improvement',
  erweiterungswunsch: 'kind:wish',
};

async function ensureTag(client, name) {
  const r = await client.query(
    `INSERT INTO tickets.tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    [name]);
  return r.rows[0].id;
}

async function migrate(client, dryRun) {
  const bugs = (await client.query(`
    SELECT ticket_id, category, reporter_email, description, url, brand,
           status, created_at, resolved_at, resolution_note,
           screenshots_json, fixed_in_pr, fixed_at
      FROM bugs.bug_tickets
     ORDER BY created_at`)).rows;

  let inserted = 0, skipped = 0;
  for (const b of bugs) {
    const exists = await client.query(
      `SELECT id FROM tickets.tickets WHERE external_id = $1`, [b.ticket_id]);
    if (exists.rowCount > 0) { skipped++; continue; }

    if (dryRun) { inserted++; continue; }

    const m = STATUS_MAP[b.status] ?? STATUS_MAP.open;
    const ins = await client.query(
      `INSERT INTO tickets.tickets
         (external_id, type, brand, title, description, url, reporter_email,
          status, resolution, created_at, done_at, archived_at)
       VALUES
         ($1, 'bug', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [b.ticket_id, b.brand,
       b.description.slice(0, 200),
       b.description,
       b.url, b.reporter_email,
       m.status, m.resolution, b.created_at,
       m.status === 'done'     ? (b.resolved_at ?? b.fixed_at) : null,
       m.status === 'archived' ? (b.fixed_at    ?? b.resolved_at) : null]);
    const newId = ins.rows[0].id;

    if (b.category && CATEGORY_TAG[b.category]) {
      const tagId = await ensureTag(client, CATEGORY_TAG[b.category]);
      await client.query(
        `INSERT INTO tickets.ticket_tags (ticket_id, tag_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`, [newId, tagId]);
    }

    if (b.resolution_note) {
      await client.query(
        `INSERT INTO tickets.ticket_comments
           (ticket_id, author_label, kind, body, visibility, created_at)
         VALUES ($1, 'migration', 'status_change', $2, 'internal', $3)`,
        [newId, b.resolution_note, b.resolved_at ?? b.created_at]);
    }

    inserted++;
  }
  return { inserted, skipped };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.TRACKING_DB_URL ?? process.env.WEBSITE_DB_URL
    ?? 'postgres://postgres:postgres@localhost:5432/website';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (apply) await client.query('BEGIN');
    const r = await migrate(client, !apply);
    if (apply) await client.query('COMMIT');
    console.log(JSON.stringify({ ...r, mode: apply ? 'apply' : 'dry-run' }));
  } catch (err) {
    if (apply) await client.query('ROLLBACK').catch(() => {});
    console.error(err.message);
    process.exit(1);
  } finally { await client.end(); }
}
main();
