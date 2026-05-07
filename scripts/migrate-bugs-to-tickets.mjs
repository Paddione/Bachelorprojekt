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

  let inserted = 0, skipped = 0, unknownStatus = 0;
  for (const b of bugs) {
    const exists = await client.query(
      `SELECT id FROM tickets.tickets WHERE external_id = $1`, [b.ticket_id]);
    if (exists.rowCount > 0) { skipped++; continue; }

    if (dryRun) { inserted++; continue; }

    const known = STATUS_MAP[b.status];
    if (!known) {
      console.warn(`WARN: unknown status "${b.status}" for ticket ${b.ticket_id} — migrating as triage`);
      unknownStatus++;
    }
    const m = known ?? STATUS_MAP.open;

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

    // comments — copy bugs.bug_ticket_comments to tickets.ticket_comments
    const comments = (await client.query(
      `SELECT author, kind, body, created_at FROM bugs.bug_ticket_comments
        WHERE ticket_id = $1 ORDER BY created_at`, [b.ticket_id])).rows;
    for (const c of comments) {
      await client.query(
        `INSERT INTO tickets.ticket_comments
           (ticket_id, author_label, kind, body, visibility, created_at)
         VALUES ($1, $2, $3, $4, 'internal', $5)`,
        [newId, c.author, c.kind, c.body, c.created_at]);
    }

    // screenshots → attachments (kept as data_url for back-compat)
    if (b.screenshots_json && Array.isArray(b.screenshots_json)) {
      let i = 0;
      for (const dataUrl of b.screenshots_json) {
        const m = String(dataUrl).match(/^data:([^;]+);/);
        await client.query(
          `INSERT INTO tickets.ticket_attachments
             (ticket_id, filename, data_url, mime_type)
           VALUES ($1, $2, $3, $4)`,
          [newId, `screenshot-${++i}`, dataUrl, m ? m[1] : 'application/octet-stream']);
      }
    }

    // fixed_in_pr → ticket_links self-link with kind='fixes' + pr_number
    if (b.fixed_in_pr) {
      await client.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number)
         VALUES ($1, $1, 'fixes', $2) ON CONFLICT DO NOTHING`,
        [newId, b.fixed_in_pr]);
    }

    inserted++;
  }

  // Replace bugs.bug_tickets with a back-compat view (run only after data is in tickets.tickets)
  if (!dryRun) {
    // Rename legacy tables only if they still exist as tables (not views).
    // pg_tables only lists base tables, not views — so this is idempotent.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_tables WHERE schemaname='bugs' AND tablename='bug_tickets'
        ) THEN
          EXECUTE 'ALTER TABLE bugs.bug_tickets RENAME TO bug_tickets_legacy';
        END IF;
        IF EXISTS (
          SELECT 1 FROM pg_tables WHERE schemaname='bugs' AND tablename='bug_ticket_comments'
        ) THEN
          EXECUTE 'ALTER TABLE bugs.bug_ticket_comments RENAME TO bug_ticket_comments_legacy';
        END IF;
      END $$
    `);
    await client.query(`
      CREATE OR REPLACE VIEW bugs.bug_tickets AS
      SELECT
        t.external_id      AS ticket_id,
        t.brand            AS brand,
        t.url              AS url,
        t.description      AS description,
        t.reporter_email   AS reporter_email,
        CASE t.status
          WHEN 'triage'       THEN 'open'
          WHEN 'backlog'      THEN 'open'
          WHEN 'in_progress'  THEN 'open'
          WHEN 'in_review'    THEN 'open'
          WHEN 'blocked'      THEN 'open'
          WHEN 'done'         THEN 'resolved'
          WHEN 'archived'     THEN 'archived'
        END                AS status,
        t.created_at       AS created_at,
        t.done_at          AS resolved_at,
        (SELECT pr_number FROM tickets.ticket_links
          WHERE from_id = t.id AND kind = 'fixes' AND pr_number IS NOT NULL
          ORDER BY created_at DESC LIMIT 1) AS fixed_in_pr,
        (SELECT created_at FROM tickets.ticket_links
          WHERE from_id = t.id AND kind = 'fixes' AND pr_number IS NOT NULL
          ORDER BY created_at DESC LIMIT 1) AS fixed_at
      FROM tickets.tickets t
      WHERE t.type = 'bug'
    `);
  }

  return { inserted, skipped, unknownStatus };
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
    await client.end().catch(() => {});
    console.error(err.message);
    process.exit(1);
  }
  await client.end();
}
main();
