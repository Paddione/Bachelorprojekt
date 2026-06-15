import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// pg-mem does not support WITH RECURSIVE CTEs or NOT EXISTS with outer aliases.
// The view is approximated here with a 2-hop UNION ALL that is semantically
// equivalent for the test fixture (max depth: project → feature → leaf task/bug).
// The production view DDL (cockpit-schema.ts / migration SQL) is the single
// source of truth and is NOT changed by this test workaround.

const { mem } = vi.hoisted(() => {
  const { newDb, DataType } = require('pg-mem') as typeof import('pg-mem');
  const db = newDb();
  // Register functions not built into pg-mem
  db.public.registerFunction({
    name: 'nullif',
    args: [DataType.integer, DataType.integer],
    returns: DataType.integer,
    implementation: (a: number, b: number) => (a === b ? null : a),
  });
  db.public.registerFunction({
    name: 'nullif',
    args: [DataType.float, DataType.integer],
    returns: DataType.float,
    implementation: (a: number, b: number) => (a === b ? null : a),
  });
  db.public.registerFunction({
    name: 'round',
    args: [DataType.float],
    returns: DataType.integer,
    implementation: (a: number) => Math.round(a),
  });
  return { mem: db };
});

vi.mock('../website-db', () => {
  const pg = mem.adapters.createPg();
  const pool = new pg.Pool();
  return { pool, ensureSchemaOnce: async (_k: string, fn: () => Promise<void>) => fn() };
});

import { pool } from '../website-db';
import { getPortfolio, getFeatureTickets } from './cockpit-db';
import { updatePlanningRanks, reparentTicket, batchMutate } from './cockpit-db';

const rows: [string, string, string, string, string | null, string][] = [
  ['p1', 'project', 'Produkt A', null!, null, 'backlog'],
  ['f1', 'feature', 'Feature One', 'p1', 'Improves onboarding', 'backlog'],
  ['f2', 'feature', 'Feature Two', 'p1', null, 'backlog'],
  ['t1', 'task', 'T1', 'f1', null, 'done'],
  ['t2', 'task', 'T2', 'f1', null, 'blocked'],
  ['t3', 'bug', 'T3', 'f2', null, 'in_progress'],
  ['t4', 'task', 'T4', 'f2', null, 'in_progress'],
  ['t5', 'task', 'T5', 'f2', null, 'backlog'],
];

/** pg-mem-compatible 2-hop view approximating v_cockpit_rollup for the test fixture.
 *  The UNION ALL covers: (1) direct leaf children of containers; (2) grandchild
 *  leaves accessed through one intermediate feature node. This matches the
 *  test fixture depth. NOT used in production — production runs the RECURSIVE CTE. */
const PG_MEM_COMPAT_VIEW_SQL = `
  CREATE VIEW tickets.v_cockpit_rollup AS
  WITH all_leaves AS (
    SELECT l.parent_id AS container_id, l.status
    FROM tickets.tickets l
    WHERE l.type IN ('task','bug')
    UNION ALL
    SELECT mid.parent_id AS container_id, l2.status
    FROM tickets.tickets mid
    JOIN tickets.tickets l2 ON l2.parent_id = mid.id
    WHERE l2.type IN ('task','bug') AND mid.type IN ('feature')
  ),
  agg AS (
    SELECT
      container_id,
      COUNT(*)::int AS total_leaves,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)::int AS done_leaves,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END)::int AS blocked_leaves,
      SUM(CASE WHEN status IN ('in_progress','in_review') THEN 1 ELSE 0 END)::int AS in_progress_leaves,
      SUM(CASE WHEN status IN ('triage','backlog','planning','plan_staged') THEN 1 ELSE 0 END)::int AS open_leaves
    FROM all_leaves
    GROUP BY container_id
  )
  SELECT
    c.id AS container_id,
    COALESCE(a.total_leaves, 0) AS total_leaves,
    COALESCE(a.done_leaves, 0) AS done_leaves,
    COALESCE(a.blocked_leaves, 0) AS blocked_leaves,
    COALESCE(a.in_progress_leaves, 0) AS in_progress_leaves,
    COALESCE(a.open_leaves, 0) AS open_leaves,
    COALESCE(ROUND(100.0 * a.done_leaves / NULLIF(a.total_leaves, 0))::int, 0) AS pct_done,
    CASE
      WHEN COALESCE(a.blocked_leaves, 0) > 0 THEN 'red'
      WHEN COALESCE(a.total_leaves, 0) > 0
           AND ROUND(100.0 * a.done_leaves / NULLIF(a.total_leaves, 0))::int = 100 THEN 'green'
      ELSE 'amber'
    END AS health
  FROM tickets.tickets c
  LEFT JOIN agg a ON a.container_id = c.id
  WHERE c.type IN ('project','feature')
`;

async function createSchema() {
  await pool.query('CREATE SCHEMA tickets');
  await pool.query(`
    CREATE TABLE tickets.tickets (
      id text PRIMARY KEY, external_id text, brand text, type text,
      title text, value_prop text, priority text, status text,
      parent_id text, planning_rank int,
      updated_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    )`);
  await pool.query(PG_MEM_COMPAT_VIEW_SQL);
}

async function insertRows() {
  let rank = 0;
  for (const [id, type, title, parent, vp, status] of rows) {
    await pool.query(
      `INSERT INTO tickets.tickets
         (id, external_id, brand, type, title, value_prop, priority, status, parent_id, planning_rank)
       VALUES ($1,$1,'mentolder',$2,$3,$4,'mittel',$5,$6,$7)`,
      [id, type, title, vp, status, parent, rank++],
    );
  }
}

beforeAll(async () => {
  await createSchema();
});

beforeEach(async () => {
  await pool.query('DELETE FROM tickets.tickets');
  await insertRows();
});

describe('getPortfolio', () => {
  it('returns products with nested features and rollups', async () => {
    const out = await getPortfolio('mentolder');
    expect(out.products).toHaveLength(1);
    const p = out.products[0];
    expect(p.extId).toBe('p1');
    expect(p.features).toHaveLength(2);
    // Product rollup across all 5 leaves: 1 done / 5 total = 20%, blocked>0 => red
    expect(p.rollup.total).toBe(5);
    expect(p.rollup.done).toBe(1);
    expect(p.rollup.blocked).toBe(1);
    expect(p.rollup.pctDone).toBe(20);
    expect(p.features.find(f => f.extId === 'f1')!.health).toBe('red');
  });

  it('scopes to brand (korczewski sees nothing here)', async () => {
    const out = await getPortfolio('korczewski');
    expect(out.products).toHaveLength(0);
  });
});

describe('getFeatureTickets', () => {
  it('returns only leaf tickets for the feature, ordered by rank', async () => {
    const out = await getFeatureTickets('mentolder', 'f1');
    expect(out.feature.extId).toBe('f1');
    expect(out.tickets.map(t => t.extId)).toEqual(['t1', 't2']);
    expect(out.tickets.every(t => ['task', 'bug'].includes(t.type))).toBe(true);
  });

  it('returns null-ish (throws NotFound) for cross-brand feature', async () => {
    await expect(getFeatureTickets('korczewski', 'f1')).rejects.toThrow();
  });
});

describe('updatePlanningRanks', () => {
  it('updates ranks for same-brand tickets', async () => {
    await updatePlanningRanks('mentolder', [
      { ticketId: 't2', planningRank: 0 },
      { ticketId: 't1', planningRank: 1 },
    ]);
    const out = await getFeatureTickets('mentolder', 'f1');
    expect(out.tickets.map(t => t.extId)).toEqual(['t2', 't1']);
  });

  it('rejects cross-brand ids', async () => {
    await expect(updatePlanningRanks('korczewski', [{ ticketId: 't1', planningRank: 0 }]))
      .rejects.toThrow();
  });
});

describe('reparentTicket', () => {
  it('moves a leaf to a new feature', async () => {
    await reparentTicket('mentolder', 't1', 'f2');
    const out = await getFeatureTickets('mentolder', 'f2');
    expect(out.tickets.map(t => t.extId)).toContain('t1');
  });

  it('allows reparent to null (top-level)', async () => {
    await reparentTicket('mentolder', 'f1', null);
    // f1 becomes a parentless feature; getPortfolio surfaces it under "Ohne Produkt"
    const portfolio = await getPortfolio('mentolder');
    const loose = portfolio.products.find(p => p.extId === '__no_product__');
    expect(loose?.features.some(f => f.extId === 'f1')).toBe(true);
  });
});

describe('batchMutate', () => {
  it('applies status to multiple tickets and reports per-id results', async () => {
    const res = await batchMutate('mentolder', ['t4', 't5'], { status: 'done' });
    expect(res.ok).toBe(true);
    expect(res.results.filter(r => r.success)).toHaveLength(2);
    const out = await getFeatureTickets('mentolder', 'f2');
    expect(out.tickets.filter(t => t.status === 'done').map(t => t.extId).sort())
      .toEqual(['t4', 't5']);
  });
});
