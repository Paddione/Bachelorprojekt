import { describe, it, expect, vi } from 'vitest';

vi.mock('pg', () => {
  const { newDb } = require('pg-mem') as typeof import('pg-mem');
  const mem = newDb();
  mem.public.none(`
    CREATE SCHEMA tickets;
    CREATE TABLE tickets.tickets (
      id text, external_id text, type text, title text, priority text, status text,
      pipeline_slot int, retry_count int, done_at timestamptz, created_at timestamptz, updated_at timestamptz);
    CREATE TABLE tickets.factory_phase_events (
      id serial, ticket_id text, phase text, state text, detail text, driver text, at timestamptz);
    CREATE TABLE tickets.factory_control (key text, brand text, value text, set_by text, updated_at timestamptz);
    CREATE TABLE tickets.ticket_links (
      id serial, from_id text, to_id text, kind text, pr_number int, created_at timestamptz);
    CREATE TABLE tickets.ticket_comments (id serial, ticket_id text, author_label text, kind text, body text, visibility text, created_at timestamptz);
    CREATE TABLE tickets.ticket_injections (
      id text, ticket_id text, phase text, kind text, title text, content text,
      target_files text[], data_url text, nc_path text, filename text, mime_type text,
      injected_by text, injected_at timestamptz, consumed_at timestamptz);
    CREATE VIEW tickets.v_factory_metrics AS
      SELECT day, features_shipped, avg_cycle_time_h FROM (VALUES
        ('2026-06-08'::date, 3, 4.2::numeric)) AS v(day, features_shipped, avg_cycle_time_h);

    -- one active ticket in a slot, latest event = implement/entered
    INSERT INTO tickets.tickets VALUES
      ('h1','T000459','feature','Hall feature','hoch','in_progress',1,0,NULL, now(), now()),
      -- one blocked active ticket, latest event = verify/blocked
      ('b1','T000460','feature','Blocked feature','mittel','in_progress',2,1,NULL, now(), now()),
      -- one backlog feature waiting (no slot)
      ('d1','T000480','feature','Dock feature','niedrig','backlog',NULL,0,NULL, now(), now()),
      -- one shipped ticket
      ('s1','T000467','feature','Shipped feature','mittel','done',NULL,0, now(), now(), now()),
      -- LEAKED: a terminal (archived) ticket that still holds a stale pipeline_slot
      ('x1','T000466','feature','Leaked terminal slot','mittel','archived',4,0,NULL, now(), now() - INTERVAL '30 min')
      -- devflow ticket: NO pipeline_slot, but has driver='devflow' phase events
      ,('dv1','T000582','feature','Devflow feature','hoch','in_progress',NULL,0,NULL, now(), now())
      -- Kommissionierung: two plan_staged tickets (one with ref, one without)
      ,('p1','T000490','feature','Staged mit Ref','hoch','plan_staged',NULL,0,NULL, now() - INTERVAL '5 min', now())
      ,('p2','T000491','feature','Staged ohne Ref','niedrig','plan_staged',NULL,0,NULL, now() - INTERVAL '2 min', now());
    INSERT INTO tickets.factory_phase_events (ticket_id, phase, state, detail, driver, at) VALUES
      ('h1','scout','done',NULL,'factory', now() - INTERVAL '10 min'),
      ('h1','implement','entered',NULL,'factory', now() - INTERVAL '2 min'),
      ('b1','verify','blocked','2 HIGH review findings','factory', now() - INTERVAL '1 min'),
      ('dv1','implement','done',NULL,'devflow', now() - INTERVAL '4 min'),
      ('dv1','deploy','entered','PR #1512 · CI watch','devflow', now() - INTERVAL '1 min');
    INSERT INTO tickets.factory_control (key, brand, value) VALUES
      ('killswitch', NULL, 'off'),
      ('daily-cap', NULL, '5');
    INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number, created_at) VALUES
      ('s1','s1','pr', 1422, now());
    INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility) VALUES
      ('p1','dev-flow-plan','FACTORY-PLAN-REF branch=feature/staged-eins plan=docs/superpowers/plans/2026-06-10-staged-eins.md','internal');
  `);
  const { Pool } = mem.adapters.createPg();
  return { default: { Pool }, Pool };
});
vi.mock('./tickets-db', () => ({
  initTicketsSchema: vi.fn().mockResolvedValue(undefined),
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}));

import { getHall, getLoadingDock, getShipped, getMetrics, getControl,
         insertInjection, getInjections, consumeInjections, getTicketDetail,
         getStaged, releaseToBacklog } from './factory-floor';
import { aggregateCheckRuns } from './github-ci';

describe('factory-floor DAL', () => {
  it('getHall derives the latest phase/state per active ticket and the block reason', async () => {
    const hall = await getHall();
    const byId = Object.fromEntries(hall.map((h) => [h.extId, h]));
    expect(byId['T000459'].phase).toBe('implement');
    expect(byId['T000459'].phaseState).toBe('entered');
    expect(byId['T000459'].blockReason).toBeNull();
    expect(byId['T000460'].phase).toBe('verify');
    expect(byId['T000460'].phaseState).toBe('blocked');
    expect(byId['T000460'].blockReason).toBe('2 HIGH review findings');
    expect(byId['T000460'].retryCount).toBe(1);
  });

  it('getLoadingDock returns backlog features with a wait reason', async () => {
    const dock = await getLoadingDock(2, 3); // slots not full
    expect(dock.map((d) => d.extId)).toEqual(['T000480']);
    expect(dock[0].waitReason).toBe('wartet auf Dispatch');
  });

  it('getLoadingDock reports "Slot voll" when slotsUsed >= slotsCap', async () => {
    const dock = await getLoadingDock(3, 3);
    expect(dock[0].waitReason).toBe('Slot voll');
  });

  it('getShipped returns done tickets with PR linkage', async () => {
    const shipped = await getShipped();
    expect(shipped.map((s) => s.extId)).toEqual(['T000467']);
    expect(shipped[0].prNumber).toBe(1422);
  });

  it('getMetrics reports today throughput + cycle time', async () => {
    const m = await getMetrics();
    expect(m.shippedToday).toBe(3);
    expect(m.avgCycleH).toBe(4.2);
  });

  it('getControl maps killswitch + slot usage + daily cap', async () => {
    const c = await getControl(3);
    expect(c.killSwitch).toBe(false);
    expect(c.slotsCap).toBe(3);
    expect(c.slotsUsed).toBe(2); // h1 + b1 in slots
    expect(c.dailyCap).toBe(5);
  });

  it('ignores terminal tickets that still hold a stale pipeline_slot (slot-leak guard)', async () => {
    // x1 is archived but still has pipeline_slot=4 (a leaked slot) and is 30 min stale.
    const c = await getControl(3);
    expect(c.slotsUsed).toBe(2); // x1 (archived) is NOT counted as occupied
    expect(c.watchdogStale).toBe(0); // a terminal ticket's stale slot is NOT a running-stale
    const hall = await getHall();
    expect(hall.map((h) => h.extId)).not.toContain('T000466'); // archived ticket not in the Halle
  });

  it('getTicketDetail returns the full phase timeline + breadcrumbs + PR for a ticket', async () => {
    const { getTicketDetail } = await import('./factory-floor');
    const detail = await getTicketDetail('T000459');
    expect(detail).not.toBeNull();
    expect(detail!.extId).toBe('T000459');
    // two events for h1 (scout/done, implement/entered), newest first
    expect(detail!.events.length).toBe(2);
    expect(detail!.events[0].phase).toBe('implement');
    expect(detail!.retryCount).toBe(0);
  });

  it('getTicketDetail returns null for an unknown ticket', async () => {
    const { getTicketDetail } = await import('./factory-floor');
    expect(await getTicketDetail('T999999')).toBeNull();
  });

  it('getStaged returns only plan_staged features, newest-relevant first', async () => {
    const staged = await getStaged();
    const ids = staged.map((s) => s.extId);
    expect(ids).toContain('T000490');
    expect(ids).toContain('T000491');
    // keine non-plan_staged Tickets
    expect(ids).not.toContain('T000459'); // in_progress
    expect(ids).not.toContain('T000480'); // backlog
    expect(ids).not.toContain('T000467'); // done
  });

  it('getStaged parses branch + planPath from FACTORY-PLAN-REF', async () => {
    const staged = await getStaged();
    const p1 = staged.find((s) => s.extId === 'T000490')!;
    expect(p1.branch).toBe('feature/staged-eins');
    expect(p1.planPath).toBe('docs/superpowers/plans/2026-06-10-staged-eins.md');
  });

  it('getStaged yields null branch/planPath when no FACTORY-PLAN-REF exists', async () => {
    const staged = await getStaged();
    const p2 = staged.find((s) => s.extId === 'T000491')!;
    expect(p2.branch).toBeNull();
    expect(p2.planPath).toBeNull();
  });

  it('releaseToBacklog flips plan_staged -> backlog and returns true', async () => {
    const ok = await releaseToBacklog('T000490');
    expect(ok).toBe(true);
    const after = await getStaged();
    expect(after.map((s) => s.extId)).not.toContain('T000490');
  });

  it('releaseToBacklog returns false for an unknown / non-staged ext_id', async () => {
    expect(await releaseToBacklog('T999999')).toBe(false);
    expect(await releaseToBacklog('T000467')).toBe(false); // done, nicht plan_staged
  });

  it('getHall includes slot-less devflow tickets and tags driver + prNumber', async () => {
    const hall = await getHall();
    const byId = Object.fromEntries(hall.map((h) => [h.extId, h]));
    // Factory ticket keeps driver=factory, no prNumber from its detail
    expect(byId['T000459'].driver).toBe('factory');
    // devflow ticket present despite NULL pipeline_slot
    expect(byId['T000582']).toBeDefined();
    expect(byId['T000582'].driver).toBe('devflow');
    expect(byId['T000582'].phase).toBe('deploy');
    expect(byId['T000582'].prNumber).toBe(1512);
    // ciStatus is null until the API enriches it
    expect(byId['T000582'].ciStatus).toBeNull();
  });

  it('getControl does NOT count slot-less devflow tickets toward slots', async () => {
    const c = await getControl(3);
    expect(c.slotsUsed).toBe(2); // h1 + b1 only; dv1 (no slot) excluded
  });
});

describe('github-ci aggregation', () => {
  it('all completed+success → success', () => {
    expect(aggregateCheckRuns([
      { status: 'completed', conclusion: 'success' },
      { status: 'completed', conclusion: 'success' },
    ])).toBe('success');
  });
  it('any failure-ish conclusion → failure', () => {
    expect(aggregateCheckRuns([
      { status: 'completed', conclusion: 'success' },
      { status: 'completed', conclusion: 'failure' },
    ])).toBe('failure');
    expect(aggregateCheckRuns([
      { status: 'completed', conclusion: 'timed_out' },
    ])).toBe('failure');
  });
  it('any still-running check → pending', () => {
    expect(aggregateCheckRuns([
      { status: 'completed', conclusion: 'success' },
      { status: 'in_progress', conclusion: null },
    ])).toBe('pending');
  });
  it('empty list → pending', () => {
    expect(aggregateCheckRuns([])).toBe('pending');
  });
});

describe('factory-floor injection DAL', () => {
  it('insertInjection + getInjections round-trips and exposes open status', async () => {
    await insertInjection({
      extId: 'T000459', kind: 'context', phase: 'implement',
      title: 'use the new util', content: 'prefer lib/foo over inline', injectedBy: 'admin',
    });
    const rows = await getInjections('T000459');
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe('context');
    expect(rows[0].phase).toBe('implement');
    expect(rows[0].consumedAt).toBeNull();
  });

  it('consumeInjections is atomic: a second consume returns empty', async () => {
    await insertInjection({ extId: 'T000459', kind: 'note', content: 'first', injectedBy: 'admin' });
    const first = await consumeInjections('T000459', 'implement');
    const got = first.filter((r) => r.content === 'first');
    expect(got.length).toBe(1);
    const second = await consumeInjections('T000459', 'implement');
    expect(second.filter((r) => r.content === 'first').length).toBe(0);
  });

  it('phase targeting: a verify-phase injection is NOT consumed at implement, NULL-phase always is', async () => {
    await insertInjection({ extId: 'T000460', kind: 'note', phase: 'verify', content: 'verify-only', injectedBy: 'admin' });
    await insertInjection({ extId: 'T000460', kind: 'note', content: 'any-boundary', injectedBy: 'admin' });
    const atImplement = await consumeInjections('T000460', 'implement');
    const bodies = atImplement.map((r) => r.content);
    expect(bodies).toContain('any-boundary');
    expect(bodies).not.toContain('verify-only');
    const atVerify = await consumeInjections('T000460', 'verify');
    expect(atVerify.map((r) => r.content)).toContain('verify-only');
  });

  it('getTicketDetail returns injections (open + consumed)', async () => {
    await insertInjection({ extId: 'T000459', kind: 'context', content: 'detail-test', injectedBy: 'admin' });
    const d = await getTicketDetail('T000459');
    expect(d).not.toBeNull();
    expect(Array.isArray(d!.injections)).toBe(true);
    expect(d!.injections.some((i) => i.content === 'detail-test')).toBe(true);
  });
});
