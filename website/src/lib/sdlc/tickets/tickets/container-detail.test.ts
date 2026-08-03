import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

const { mem } = vi.hoisted(() => {
  const { newDb, DataType } = require('pg-mem') as typeof import('pg-mem');
  const db = newDb();
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
import { getContainerRollup, getTicketPlan, getContainerDor } from './container-detail';

// pg-mem-compatible 2-hop view approximating v_cockpit_rollup
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
  WHERE c.type IN ('project', 'feature');
`;

beforeAll(async () => {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS tickets;
    CREATE TABLE IF NOT EXISTS tickets.tickets (
      id TEXT PRIMARY KEY,
      external_id TEXT,
      type TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT 'mentolder',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'backlog',
      priority TEXT NOT NULL DEFAULT 'mittel',
      parent_id TEXT REFERENCES tickets.tickets(id),
      value_prop TEXT,
      effort TEXT,
      areas TEXT[],
      depends_on TEXT[],
      readiness JSONB,
      requirements_list TEXT[],
      is_test_data BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS tickets.ticket_plans (
      id BIGSERIAL PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets.tickets(id),
      slug TEXT NOT NULL,
      branch TEXT,
      content TEXT NOT NULL DEFAULT '',
      pr_number INTEGER,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(PG_MEM_COMPAT_VIEW_SQL);
});

async function cleanTickets() {
  await pool.query(`DELETE FROM tickets.ticket_plans`);
  await pool.query(`UPDATE tickets.tickets SET parent_id = NULL WHERE parent_id IS NOT NULL`);
  await pool.query(`DELETE FROM tickets.tickets`);
}

afterAll(async () => {
  await cleanTickets();
});

describe('getContainerRollup', () => {
  let featureId: string;

  beforeEach(async () => {
    await cleanTickets();
    const f = await pool.query(
      `INSERT INTO tickets.tickets (id, type, brand, title, status, priority)
       VALUES ('f-rollup','feature','mentolder','Feature A','backlog','mittel') RETURNING id`);
    featureId = f.rows[0].id;
    await pool.query(
      `INSERT INTO tickets.tickets (id, type, brand, title, status, priority, parent_id)
       VALUES ('t-done','task','mentolder','Leaf done','done','mittel','f-rollup')`);
    await pool.query(
      `INSERT INTO tickets.tickets (id, type, brand, title, status, priority, parent_id)
       VALUES ('t-blocked','task','mentolder','Leaf blocked','blocked','mittel','f-rollup')`);
  });

  it('maps the rollup view for a feature container', async () => {
    const r = await getContainerRollup('mentolder', featureId);
    expect(r).not.toBeNull();
    expect(r!.total).toBe(2);
    expect(r!.done).toBe(1);
    expect(r!.blocked).toBe(1);
    expect(r!.pctDone).toBe(50);
    expect(r!.health).toBe('red');
  });

  it('returns null for an unknown container id', async () => {
    expect(await getContainerRollup('mentolder', 'nonexistent')).toBeNull();
  });

  it('returns null when the container belongs to another brand', async () => {
    expect(await getContainerRollup('korczewski', featureId)).toBeNull();
  });
});

describe('getTicketPlan', () => {
  beforeEach(async () => {
    await cleanTickets();
  });

  it('returns the newest plan for the ticket only', async () => {
    const t = await pool.query(
      `INSERT INTO tickets.tickets (id, type, brand, title, status, priority)
       VALUES ('t-plan','feature','mentolder','With Plan','backlog','mittel') RETURNING id`);
    const tid = t.rows[0].id;
    await pool.query(
      `INSERT INTO tickets.ticket_plans (ticket_id, slug, branch, content, pr_number, archived_at)
       VALUES ($1,'old-plan','feature/old','# Old',101, now() - interval '2 days')`, [tid]);
    await pool.query(
      `INSERT INTO tickets.ticket_plans (ticket_id, slug, branch, content, pr_number, archived_at)
       VALUES ($1,'new-plan','feature/new','# New',202, now())`, [tid]);
    const p = await getTicketPlan('mentolder', tid);
    expect(p).not.toBeNull();
    expect(p!.slug).toBe('new-plan');
    expect(p!.branch).toBe('feature/new');
    expect(p!.prNumber).toBe(202);
    expect(p!.content).toBe('# New');
  });

  it('returns null when no plan exists', async () => {
    const t = await pool.query(
      `INSERT INTO tickets.tickets (id, type, brand, title, status, priority)
       VALUES ('t-noplan','feature','mentolder','No Plan','backlog','mittel') RETURNING id`);
    expect(await getTicketPlan('mentolder', t.rows[0].id)).toBeNull();
  });

  it('returns null for a ticket of another brand', async () => {
    const t = await pool.query(
      `INSERT INTO tickets.tickets (id, type, brand, title, status, priority)
       VALUES ('t-brand','feature','mentolder','Brandcheck','backlog','mittel') RETURNING id`);
    await pool.query(
      `INSERT INTO tickets.ticket_plans (ticket_id, slug, content) VALUES ($1,'p','# c')`,
      [t.rows[0].id]);
    expect(await getTicketPlan('korczewski', t.rows[0].id)).toBeNull();
  });
});

describe('getContainerDor', () => {
  beforeEach(async () => {
    await cleanTickets();
  });

  it('reads DoR fields and computes dorScore', async () => {
    const t = await pool.query(
      `INSERT INTO tickets.tickets
         (id, type, brand, title, status, priority, value_prop, effort, areas, depends_on,
          readiness, requirements_list)
       VALUES ('f-dor','feature','mentolder','DoR Feature','planning','mittel',
               'Nutzen X','mittel', ARRAY['website'], ARRAY['T000001'],
               '{"spec_skizziert":true,"aufwand_geschaetzt":true}'::jsonb,
               ARRAY['Req 1','Req 2'])
       RETURNING id`);
    const d = await getContainerDor('mentolder', t.rows[0].id);
    expect(d).not.toBeNull();
    expect(d!.valueProp).toBe('Nutzen X');
    expect(d!.effort).toBe('mittel');
    expect(d!.areas).toEqual(['website']);
    expect(d!.dependsOn).toEqual(['T000001']);
    expect(d!.requirementsList).toEqual(['Req 1', 'Req 2']);
    expect(d!.dorScore).toBe(2);
    expect(d!.lastenheftLocked).toBe(false);
  });

  it('reports lastenheftLocked=true when the readiness flag is set', async () => {
    const t = await pool.query(
      `INSERT INTO tickets.tickets
         (id, type, brand, title, status, priority, readiness, requirements_list)
       VALUES ('f-locked','feature','mentolder','Locked Feature','backlog','mittel',
               '{"lastenheft_locked":true}'::jsonb, ARRAY['Req 1'])
       RETURNING id`);
    const d = await getContainerDor('mentolder', t.rows[0].id);
    expect(d).not.toBeNull();
    expect(d!.lastenheftLocked).toBe(true);
  });

  it('returns null for another brand', async () => {
    const t = await pool.query(
      `INSERT INTO tickets.tickets (id, type, brand, title, status, priority)
       VALUES ('f-branddor','feature','mentolder','Brand DoR','planning','mittel') RETURNING id`);
    expect(await getContainerDor('korczewski', t.rows[0].id)).toBeNull();
  });
});
