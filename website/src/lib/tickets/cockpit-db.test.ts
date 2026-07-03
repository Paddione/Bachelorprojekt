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
 *  test fixture depth. NOT used in production — production runs the RECURSIVE CTE.
 *
 *  Mirrors the production view logic exactly:
 *  - archived leaves excluded from total_leaves (cancelled/obsolete)
 *  - qa_review counted in in_progress_leaves so every non-archived leaf falls in exactly one bucket */
const PG_MEM_COMPAT_VIEW_SQL = `
  CREATE VIEW tickets.v_cockpit_rollup AS
  WITH all_leaves AS (
    SELECT l.parent_id AS container_id, l.status
    FROM tickets.tickets l
    WHERE l.type IN ('task','bug') AND l.status <> 'archived'
    UNION ALL
    SELECT mid.parent_id AS container_id, l2.status
    FROM tickets.tickets mid
    JOIN tickets.tickets l2 ON l2.parent_id = mid.id
    WHERE l2.type IN ('task','bug') AND l2.status <> 'archived' AND mid.type IN ('feature')
  ),
  agg AS (
    SELECT
      container_id,
      COUNT(*)::int AS total_leaves,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)::int AS done_leaves,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END)::int AS blocked_leaves,
      SUM(CASE WHEN status IN ('in_progress','in_review','qa_review') THEN 1 ELSE 0 END)::int AS in_progress_leaves,
      SUM(CASE WHEN status = 'awaiting_deploy' THEN 1 ELSE 0 END)::int AS awaiting_deploy_leaves,
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
    COALESCE(a.awaiting_deploy_leaves, 0) AS awaiting_deploy_leaves,
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
      next_step boolean NOT NULL DEFAULT false,
      discarded boolean NOT NULL DEFAULT false,
      major_feature boolean NOT NULL DEFAULT false,
      suggestion_comment text,
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
    // Besides the real product p1, getPortfolio now prepends a synthetic
    // "Alle Tickets" bucket (see the dedicated describe block below).
    const p = out.products.find((x) => x.extId === 'p1')!;
    expect(p).toBeTruthy();
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

describe('rollup bucket invariant: done+blocked+inProgress+open === total', () => {
  it('qa_review leaf counts in inProgress, archived leaf excluded from total', async () => {
    // Add a qa_review leaf under f1 and an archived leaf under f1
    await pool.query(
      `INSERT INTO tickets.tickets
         (id, external_id, brand, type, title, value_prop, priority, status, parent_id, planning_rank)
       VALUES ($1,$1,'mentolder','task','QA task',null,'mittel','qa_review','f1',99)`,
      ['tqa'],
    );
    await pool.query(
      `INSERT INTO tickets.tickets
         (id, external_id, brand, type, title, value_prop, priority, status, parent_id, planning_rank)
       VALUES ($1,$1,'mentolder','task','Archived task',null,'mittel','archived','f1',100)`,
      ['tarch'],
    );

    // Query the view directly for feature f1
    const { rows } = await pool.query(
      `SELECT total_leaves, done_leaves, blocked_leaves, in_progress_leaves, open_leaves
         FROM tickets.v_cockpit_rollup WHERE container_id = 'f1'`,
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    const total = Number(r.total_leaves);
    const done = Number(r.done_leaves);
    const blocked = Number(r.blocked_leaves);
    const inProgress = Number(r.in_progress_leaves);
    const open = Number(r.open_leaves);

    // Invariant: buckets sum to total (archived tarch must NOT be in total)
    expect(done + blocked + inProgress + open).toBe(total);

    // Original f1 leaves: t1=done, t2=blocked → plus tqa=qa_review (inProgress)
    // tarch=archived → excluded from total
    expect(total).toBe(3);       // t1 + t2 + tqa (tarch excluded)
    expect(done).toBe(1);        // t1
    expect(blocked).toBe(1);     // t2
    expect(inProgress).toBe(1);  // tqa (qa_review → inProgress bucket)
    expect(open).toBe(0);
  });
});

describe('orphan tickets bucket (Ohne Feature)', () => {
  // Regression for T000848: on live every ticket had parent_id=NULL, so the
  // cockpit (which only shows tickets nested under a feature) rendered empty.
  // getPortfolio must surface parentless task/bug leaves under a synthetic
  // "Ohne Feature" bucket and getFeatureTickets must load them.
  async function insertOrphans() {
    await pool.query(
      `INSERT INTO tickets.tickets
         (id, external_id, brand, type, title, value_prop, priority, status, parent_id, planning_rank)
       VALUES ('o1','o1','mentolder','task','Orphan A',null,'mittel','backlog',null,10)`);
    await pool.query(
      `INSERT INTO tickets.tickets
         (id, external_id, brand, type, title, value_prop, priority, status, parent_id, planning_rank)
       VALUES ('o2','o2','mentolder','bug','Orphan B',null,'mittel','done',null,11)`);
    await pool.query(
      `INSERT INTO tickets.tickets
         (id, external_id, brand, type, title, value_prop, priority, status, parent_id, planning_rank)
       VALUES ('o3','o3','mentolder','task','Orphan archived',null,'mittel','archived',null,12)`);
  }

  it('surfaces parentless leaves under a synthetic __no_feature__ feature', async () => {
    await insertOrphans();
    const out = await getPortfolio('mentolder');
    const noFeat = out.products.flatMap(p => p.features).find(f => f.extId === '__no_feature__');
    expect(noFeat).toBeTruthy();
    expect(noFeat!.rollup.total).toBe(2); // o1 + o2; archived o3 excluded
    expect(noFeat!.rollup.done).toBe(1);  // o2
  });

  it('loads the orphan leaves via getFeatureTickets(__no_feature__)', async () => {
    await insertOrphans();
    const out = await getFeatureTickets('mentolder', '__no_feature__');
    expect(out.feature.extId).toBe('__no_feature__');
    expect(out.tickets.map(t => t.extId).sort()).toEqual(['o1', 'o2']); // archived excluded
    expect(out.tickets.every(t => ['task', 'bug'].includes(t.type))).toBe(true);
  });

  it('omits the synthetic bucket when every leaf is parented', async () => {
    const out = await getPortfolio('mentolder'); // base fixture: all leaves parented
    const noFeat = out.products.flatMap(p => p.features).find(f => f.extId === '__no_feature__');
    expect(noFeat).toBeUndefined();
  });

  it('scopes the orphan bucket to brand', async () => {
    await insertOrphans(); // mentolder orphans only
    const out = await getPortfolio('korczewski');
    const noFeat = out.products.flatMap(p => p.features).find(f => f.extId === '__no_feature__');
    expect(noFeat).toBeUndefined();
  });
});

describe('Alle Tickets bucket (flat all-tickets view)', () => {
  // T000877 follow-up: on mentolder every work ticket is parentless and every
  // feature is empty, so the feature-centric cockpit surfaces nothing but the
  // "Ohne Feature" catch-all. The PM asked for a flat "Alle Tickets" view that
  // lists EVERY task/bug leaf across all features, regardless of parent linkage.
  async function insertOrphans() {
    await pool.query(
      `INSERT INTO tickets.tickets
         (id, external_id, brand, type, title, value_prop, priority, status, parent_id, planning_rank)
       VALUES ('o1','o1','mentolder','task','Orphan A',null,'mittel','backlog',null,10)`);
    await pool.query(
      `INSERT INTO tickets.tickets
         (id, external_id, brand, type, title, value_prop, priority, status, parent_id, planning_rank)
       VALUES ('o2','o2','mentolder','bug','Orphan B',null,'mittel','done',null,11)`);
    await pool.query(
      `INSERT INTO tickets.tickets
         (id, external_id, brand, type, title, value_prop, priority, status, parent_id, planning_rank)
       VALUES ('o3','o3','mentolder','task','Orphan archived',null,'mittel','archived',null,12)`);
  }

  it('surfaces a synthetic __all_tickets__ bucket covering ALL non-archived leaves', async () => {
    // base fixture: t1..t5 all parented under f1/f2 (no orphans)
    const out = await getPortfolio('mentolder');
    const all = out.products.flatMap(p => p.features).find(f => f.extId === '__all_tickets__');
    expect(all).toBeTruthy();
    expect(all!.synthetic).toBe(true);
    expect(all!.rollup.total).toBe(5);   // t1..t5
    expect(all!.rollup.done).toBe(1);     // t1
    expect(all!.rollup.blocked).toBe(1);  // t2
  });

  it('appears as the FIRST product so the cockpit can default to it', async () => {
    const out = await getPortfolio('mentolder');
    expect(out.products[0].extId).toBe('__all_tickets__');
  });

  it('loads every task/bug leaf (parented + orphan) via getFeatureTickets(__all_tickets__)', async () => {
    await insertOrphans();
    const out = await getFeatureTickets('mentolder', '__all_tickets__');
    expect(out.feature.extId).toBe('__all_tickets__');
    expect(out.feature.synthetic).toBe(true);
    // t1..t5 (parented) + o1,o2 (orphan); archived o3 excluded
    expect(out.tickets.map(t => t.extId).sort()).toEqual(['o1', 'o2', 't1', 't2', 't3', 't4', 't5']);
    expect(out.tickets.every(t => ['task', 'bug'].includes(t.type))).toBe(true);
  });

  it('omits the redundant Ohne Feature bucket when EVERY leaf is orphan', async () => {
    await pool.query('DELETE FROM tickets.tickets'); // drop the parented base fixture
    await insertOrphans();                            // only orphan leaves remain
    const out = await getPortfolio('mentolder');
    const all = out.products.flatMap(p => p.features).find(f => f.extId === '__all_tickets__');
    const noFeat = out.products.flatMap(p => p.features).find(f => f.extId === '__no_feature__');
    expect(all!.rollup.total).toBe(2);   // o1 + o2 (archived o3 excluded)
    expect(noFeat).toBeUndefined();       // identical to Alle Tickets → not shown twice
  });

  it('still shows Ohne Feature when orphans are a genuine subset of all tickets', async () => {
    await insertOrphans(); // base parented fixture + 2 orphans → orphan(2) < all(7)
    const out = await getPortfolio('mentolder');
    const all = out.products.flatMap(p => p.features).find(f => f.extId === '__all_tickets__');
    const noFeat = out.products.flatMap(p => p.features).find(f => f.extId === '__no_feature__');
    expect(all!.rollup.total).toBe(7);
    expect(noFeat).toBeTruthy();
    expect(noFeat!.rollup.total).toBe(2);
  });

  it('omits Alle Tickets entirely for a brand with no tickets', async () => {
    const out = await getPortfolio('korczewski');
    expect(out.products).toHaveLength(0);
  });
});

describe.skip('PORTFOLIO_MAX_ROWS limit (B6)', () => {
  it('getPortfolio limits containers to PORTFOLIO_MAX_ROWS', async () => {
    // Seed more projects than PORTFOLIO_MAX_ROWS (1000) - use smaller batches for pg-mem compatibility
    const batchSize = 50;
    let count = 0;

    while (count < 1005) {
      const batchCount = Math.min(batchSize, 1005 - count);
      
      // Insert rows one by one to avoid pg-mem parameter limit issues
      for (let i = 0; i < batchCount; i++) {
        await pool.query(
          `INSERT INTO tickets.tickets 
           (id, external_id, brand, type, title, value_prop, priority, status, parent_id, planning_rank)
           VALUES ($1,$1,'mentolder','project',$2,'Test Project', 'mittel','backlog',$3,0)`,
          [`bulk-p-${count + i}`, `Bulk Project ${count + i}`, count + i],
        );
      }
      
      count += batchCount;
    }

    const out = await getPortfolio('mentolder');
    // All products = synthetic buckets (Alle Tickets, Ohne Feature) + at most PORTFOLIO_MAX_ROWS
    const realProducts = out.products.filter(
      p => p.extId !== '__all_tickets__' && p.extId !== '__no_feature__',
    );
    expect(realProducts.length).toBeLessThanOrEqual(1000);
  });

  it('getPortfolio still returns the correct base fixture data alongside many others', async () => {
    // Seed many extra rows, then verify the original fixture project is still found
    const batchSize = 50;
    let count = 0;

    while (count < 1005) {
      const batchCount = Math.min(batchSize, 1005 - count);
      
      for (let i = 0; i < batchCount; i++) {
        await pool.query(
          `INSERT INTO tickets.tickets 
           (id, external_id, brand, type, title, value_prop, priority, status, parent_id, planning_rank)
           VALUES ($1,$1,'mentolder','project',$2,'Test Project', 'mittel','backlog',$3,0)`,
          [`bulk-p-${count + i}`, `Bulk Project ${count + i}`, count + i + 100],
        );
      }
      
      count += batchCount;
    }

    const out = await getPortfolio('mentolder');
    // Original project 'p1' should still appear if it falls within the limit (ordered by
    // planning_rank, then created_at; original p1/P1 has rank 0 which sorts first)
    const p = out.products.find((x) => x.extId === 'p1');
    expect(p).toBeTruthy();
    expect(p!.features).toHaveLength(2);
  });
});
