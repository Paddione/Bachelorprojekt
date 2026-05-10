// PR5: confirm listTimeline reads from tickets.pr_events (the source of
// truth after the bachelorprojekt.v_timeline sunset).
//
// DB-backed: skipped unless DATABASE_URL/SESSIONS_DATABASE_URL is set.
import { describe, it, expect, beforeAll } from 'vitest';
import { listTimeline, pool } from './website-db';

const dbAvailable = !!(process.env.DATABASE_URL || process.env.SESSIONS_DATABASE_URL);

describe.skipIf(!dbAvailable)('listTimeline (DB-backed)', () => {
  beforeAll(async () => {
    // Ensure the source-of-truth table exists. tickets.pr_events is created
    // by the unified ticketing schema migration; if running in isolation we
    // create a minimal version sufficient for these tests.
    await pool.query(`CREATE SCHEMA IF NOT EXISTS tickets`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets.pr_events (
        pr_number   integer PRIMARY KEY,
        title       text NOT NULL,
        description text,
        category    text NOT NULL,
        scope       text,
        brand       text,
        merged_at   timestamptz NOT NULL,
        merged_by   text,
        status      text NOT NULL DEFAULT 'shipped',
        created_at  timestamptz NOT NULL DEFAULT now()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets.ticket_links (
        ticket_id  text NOT NULL,
        kind       text NOT NULL,
        pr_number  integer
      )`);
  });

  it('returns rows shaped like TimelineRow from tickets.pr_events', async () => {
    const probePr = 999_999_001;
    await pool.query(
      `INSERT INTO tickets.pr_events (pr_number, title, description, category, scope, brand, merged_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (pr_number) DO UPDATE SET title=EXCLUDED.title`,
      [probePr, 'PR5 listTimeline probe', 'desc', 'feat', 'tickets', 'mentolder', '2026-05-09T12:00:00Z'],
    );

    const rows = await listTimeline({ limit: 50 });
    const probe = rows.find(r => r.pr_number === probePr);
    expect(probe).toBeDefined();
    expect(probe!.title).toBe('PR5 listTimeline probe');
    expect(probe!.category).toBe('feat');
    expect(probe!.brand).toBe('mentolder');
    expect(probe!.day).toBe('2026-05-09');
    // Requirement linkage no longer applies — both fields are NULL.
    expect(probe!.requirement_id).toBeNull();
    expect(probe!.requirement_name).toBeNull();
    expect(typeof probe!.bugs_fixed).toBe('number');

    await pool.query(`DELETE FROM tickets.pr_events WHERE pr_number = $1`, [probePr]);
  });

  it('filters by brand (returns null-brand rows + matching brand)', async () => {
    const ids = [999_999_101, 999_999_102, 999_999_103];
    await pool.query(`DELETE FROM tickets.pr_events WHERE pr_number = ANY($1)`, [ids]);
    await pool.query(
      `INSERT INTO tickets.pr_events (pr_number, title, category, brand, merged_at) VALUES
       ($1, 'mentolder-only', 'feat', 'mentolder', now()),
       ($2, 'korczewski-only', 'feat', 'korczewski', now()),
       ($3, 'no-brand', 'feat', NULL, now())`,
      ids,
    );

    const mentolder = await listTimeline({ brand: 'mentolder', limit: 100 });
    const titles = mentolder.map(r => r.title);
    expect(titles).toContain('mentolder-only');
    expect(titles).toContain('no-brand');
    expect(titles).not.toContain('korczewski-only');

    await pool.query(`DELETE FROM tickets.pr_events WHERE pr_number = ANY($1)`, [ids]);
  });
});
