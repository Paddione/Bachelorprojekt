// scripts/migrate-tracking-to-tickets.mjs
//
// PR2/5: Migrates bachelorprojekt.requirements → tickets.tickets (type='feature')
// and bachelorprojekt.features → tickets.pr_events. For each feature row that
// referenced a requirement, writes a tickets.ticket_links row. Renames the
// legacy tables to *_legacy and replaces them with back-compat views over the
// new schema, then rebuilds bachelorprojekt.v_timeline.
//
// Idempotent: detects already-migrated rows by external_id / pr_number.
//
// Usage:
//   node scripts/migrate-tracking-to-tickets.mjs            # dry-run (default)
//   node scripts/migrate-tracking-to-tickets.mjs --apply    # execute changes
//
// Env: TRACKING_DB_URL or WEBSITE_DB_URL (Postgres connection string).
import pg from 'pg';

async function migrate(client, dryRun) {
  const out = { reqsMigrated: 0, reqsSkipped: 0,
                prsMigrated: 0,  prsSkipped: 0,
                linksCreated: 0, linksSkipped: 0 };

  // ── 1. requirements → tickets.tickets (type='feature') ──────────────
  const hasReqs = (await client.query(
    `SELECT to_regclass('bachelorprojekt.requirements') IS NOT NULL AS present`
  )).rows[0].present;
  const reqs = hasReqs ? (await client.query(`
    SELECT id, category, name, description, criteria, test_case, created_at
      FROM bachelorprojekt.requirements
     ORDER BY created_at`)).rows : [];

  // Per spec §9 PR2: status is derived from the latest pipeline.stage if present,
  // else 'backlog'. In practice `bachelorprojekt.pipeline` has never been written
  // to from application code (only DDL), so most rows hit the `backlog` default —
  // but we honor the spec for any manually-seeded stages.
  const STAGE_TO_STATUS = {
    idea:           { status: 'backlog',     resolution: null      },
    implementation: { status: 'in_progress', resolution: null      },
    testing:        { status: 'in_review',   resolution: null      },
    documentation:  { status: 'in_review',   resolution: null      },
    archive:        { status: 'done',        resolution: 'shipped' },
  };

  for (const r of reqs) {
    const exists = await client.query(
      `SELECT id FROM tickets.tickets WHERE external_id = $1`, [r.id]);
    if (exists.rowCount > 0) { out.reqsSkipped++; continue; }
    if (dryRun) { out.reqsMigrated++; continue; }

    // Look up latest pipeline stage; missing pipeline table or no stages → backlog.
    const hasPipeline = (await client.query(
      `SELECT to_regclass('bachelorprojekt.pipeline') IS NOT NULL AS present`
    )).rows[0].present;
    let mapped = { status: 'backlog', resolution: null };
    if (hasPipeline) {
      const stageRow = await client.query(
        `SELECT stage FROM bachelorprojekt.pipeline
          WHERE req_id = $1
          ORDER BY entered_at DESC LIMIT 1`, [r.id]);
      if (stageRow.rowCount > 0) {
        const known = STAGE_TO_STATUS[stageRow.rows[0].stage];
        if (known) mapped = known;
      }
    }

    const desc = [r.description, r.criteria && `\n\nKriterien:\n${r.criteria}`,
                  r.test_case  && `\n\nTestfall:\n${r.test_case}`]
                  .filter(Boolean).join('');
    await client.query(
      `INSERT INTO tickets.tickets
         (external_id, type, brand, title, description, thesis_tag,
          status, resolution, priority, created_at)
       VALUES ($1, 'feature', $2, $3, $4, $5, $6, $7, 'mittel', $8)`,
      [r.id, 'mentolder', r.name, desc || null, r.id,
       mapped.status, mapped.resolution, r.created_at]);
    out.reqsMigrated++;
  }

  // ── 2. features → tickets.pr_events ─────────────────────────────────
  const hasFeats = (await client.query(
    `SELECT to_regclass('bachelorprojekt.features') IS NOT NULL AS present`
  )).rows[0].present;
  // We must read from the *base table*, not a view (this script may run twice).
  const featsFromBase = hasFeats && (await client.query(
    `SELECT 1 FROM pg_tables WHERE schemaname='bachelorprojekt' AND tablename='features'`
  )).rowCount > 0;
  const feats = featsFromBase ? (await client.query(`
    SELECT pr_number, title, description, category, scope, brand,
           requirement_id, merged_at, merged_by, status, created_at
      FROM bachelorprojekt.features
     ORDER BY merged_at`)).rows : [];

  for (const f of feats) {
    if (f.pr_number == null) { out.prsSkipped++; continue; }
    const exists = await client.query(
      `SELECT pr_number FROM tickets.pr_events WHERE pr_number = $1`, [f.pr_number]);
    if (exists.rowCount > 0) { out.prsSkipped++; continue; }
    if (dryRun) { out.prsMigrated++; continue; }

    await client.query(
      `INSERT INTO tickets.pr_events
         (pr_number, title, description, category, scope, brand,
          merged_at, merged_by, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [f.pr_number, f.title, f.description, f.category, f.scope, f.brand,
       f.merged_at, f.merged_by, f.status, f.created_at]);
    out.prsMigrated++;
  }

  // ── 3. ticket_links: feature_ticket → self with kind='fixes' ───────
  // Same self-loop semantic as track-pr.mjs uses for bug references:
  // (from_id=ticket_id, to_id=ticket_id, kind='fixes', pr_number=N) means
  // "this ticket was fixed by PR N".
  if (!dryRun) {
    for (const f of feats) {
      if (!f.requirement_id || f.pr_number == null) continue;
      const t = await client.query(
        `SELECT id FROM tickets.tickets WHERE external_id = $1 AND type='feature'`,
        [f.requirement_id]);
      if (t.rowCount === 0) { out.linksSkipped++; continue; }
      const r = await client.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number)
         VALUES ($1, $1, 'fixes', $2)
         ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
        [t.rows[0].id, f.pr_number]);
      if (r.rowCount === 1) out.linksCreated++; else out.linksSkipped++;
    }
  } else {
    out.linksCreated = feats.filter(f => f.requirement_id && f.pr_number != null).length;
  }

  // ── 4. Rename legacy tables → back-compat views ─────────────────────
  if (!dryRun) {
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_tables WHERE schemaname='bachelorprojekt' AND tablename='features'
        ) THEN
          EXECUTE 'ALTER TABLE bachelorprojekt.features RENAME TO features_legacy';
        END IF;
        IF EXISTS (
          SELECT 1 FROM pg_tables WHERE schemaname='bachelorprojekt' AND tablename='requirements'
        ) THEN
          EXECUTE 'ALTER TABLE bachelorprojekt.requirements RENAME TO requirements_legacy';
        END IF;
      END $$
    `);

    // bachelorprojekt.requirements view
    await client.query(`
      CREATE OR REPLACE VIEW bachelorprojekt.requirements AS
      SELECT
        thesis_tag AS id,
        COALESCE(NULLIF(split_part(thesis_tag, '-', 1), ''), 'L') AS category,
        title AS name,
        description AS description,
        NULL::TEXT AS criteria,
        NULL::TEXT AS test_case,
        created_at
      FROM tickets.tickets
      WHERE type = 'feature' AND thesis_tag IS NOT NULL
    `);

    // bachelorprojekt.features view (preserves all columns the old timeline
    // and any straggling reader expected, including a synthetic `id` and a
    // single requirement_id chosen from the first 'fixes' link).
    await client.query(`
      CREATE OR REPLACE VIEW bachelorprojekt.features AS
      SELECT
        pe.pr_number  AS id,
        pe.pr_number,
        pe.title,
        pe.description,
        pe.category,
        pe.scope,
        pe.brand,
        req.thesis_tag AS requirement_id,
        pe.merged_at,
        pe.merged_by,
        pe.status,
        pe.created_at
      FROM tickets.pr_events pe
      LEFT JOIN LATERAL (
        SELECT t.thesis_tag
          FROM tickets.ticket_links tl
          JOIN tickets.tickets t ON t.id = tl.from_id
         WHERE tl.pr_number = pe.pr_number
           AND tl.kind = 'fixes'
           AND t.type = 'feature'
         ORDER BY tl.created_at LIMIT 1
      ) req ON true
    `);

    // bachelorprojekt.v_timeline view (same column shape as before:
    // id, day, merged_at, pr_number, title, description, category, scope,
    // brand, requirement_id, requirement_name, requirement_category)
    await client.query(`
      CREATE OR REPLACE VIEW bachelorprojekt.v_timeline AS
      SELECT
        pe.pr_number          AS id,
        pe.merged_at::date    AS day,
        pe.merged_at,
        pe.pr_number,
        pe.title,
        pe.description,
        pe.category,
        pe.scope,
        pe.brand,
        req.thesis_tag        AS requirement_id,
        req.title             AS requirement_name,
        COALESCE(NULLIF(split_part(req.thesis_tag, '-', 1), ''), NULL)
                              AS requirement_category
      FROM tickets.pr_events pe
      LEFT JOIN LATERAL (
        SELECT t.id, t.thesis_tag, t.title
          FROM tickets.ticket_links tl
          JOIN tickets.tickets t ON t.id = tl.from_id
         WHERE tl.pr_number = pe.pr_number
           AND tl.kind = 'fixes'
           AND t.type = 'feature'
         ORDER BY tl.created_at LIMIT 1
      ) req ON true
      ORDER BY pe.merged_at DESC
    `);
  }

  return out;
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
