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
      ('s1','T000467','feature','Shipped feature','mittel','done',NULL,0, now(), now(), now());
    INSERT INTO tickets.factory_phase_events (ticket_id, phase, state, detail, driver, at) VALUES
      ('h1','scout','done',NULL,'factory', now() - INTERVAL '10 min'),
      ('h1','implement','entered',NULL,'factory', now() - INTERVAL '2 min'),
      ('b1','verify','blocked','2 HIGH review findings','factory', now() - INTERVAL '1 min');
    INSERT INTO tickets.factory_control (key, brand, value) VALUES
      ('killswitch', NULL, 'off'),
      ('daily-cap', NULL, '5');
    INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number, created_at) VALUES
      ('s1','s1','pr', 1422, now());
  `);
  const { Pool } = mem.adapters.createPg();
  return { default: { Pool }, Pool };
});
vi.mock('./tickets-db', () => ({
  initTicketsSchema: vi.fn().mockResolvedValue(undefined),
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}));

import { getHall, getLoadingDock, getShipped, getMetrics, getControl } from './factory-floor';

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
});
