import { describe, it, expect, vi } from 'vitest';

vi.mock('pg', () => {
  const { newDb, DataType } = require('pg-mem') as typeof import('pg-mem');
  const mem = newDb();

  // Register to_char function for pg-mem
  mem.public.registerFunction({
    name: 'to_char',
    args: [DataType.date, DataType.text],
    returns: DataType.text,
    implementation: (date: Date | string | null, _format: string) => {
      if (!date) return null;
      const d = new Date(date);
      if (isNaN(d.getTime())) return String(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  });

  mem.public.none(`
    CREATE SCHEMA tickets;
    CREATE TABLE tickets.v_factory_metrics (
      day date, features_shipped int, avg_cycle_time_h numeric,
      escalations int, total_features int);
    INSERT INTO tickets.v_factory_metrics VALUES
      ('2026-06-04', 3, 5.5, 1, 7),
      ('2026-06-03', 2, 9.0, 0, 4);
    CREATE TABLE tickets.v_active_features (
      id text, external_id text, title text, priority text, status text,
      touched_files text, pipeline_slot int, created_at timestamptz, updated_at timestamptz);
    INSERT INTO tickets.v_active_features VALUES
      ('u1','T000500','Feature A','hoch','in_progress','k3d/a.yaml',1, now(), now());
    CREATE TABLE tickets.feature_flags (
      id int, brand text, key text, enabled boolean, created_at timestamptz, set_by text);
    INSERT INTO tickets.feature_flags VALUES
      (1,'mentolder','dark-a', false, now(), 'factory'),
      (2,'mentolder','dark-b', true,  now(), 'admin');
  `);
  const { Pool } = mem.adapters.createPg();
  return { default: { Pool }, Pool };
});
vi.mock('./tickets-schema', () => ({
  initTicketsSchema: vi.fn().mockResolvedValue(undefined),
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('./tickets/transition', () => ({ transitionTicket: vi.fn().mockResolvedValue(undefined) }));

import { listFactoryMetrics } from './factory-metrics';

describe('listFactoryMetrics', () => {
  it('returns metric rows newest-day-first with all KPI columns', async () => {
    const rows = await listFactoryMetrics();
    expect(rows.length).toBe(2);
    expect(rows[0].day).toBe('2026-06-04');
    expect(rows[0].features_shipped).toBe(3);
    expect(Number(rows[0].avg_cycle_time_h)).toBe(5.5);
    expect(rows[0].escalations).toBe(1);
    expect(rows[0].total_features).toBe(7);
  });

  it('listActiveFeatures returns the active working set with pipeline_slot', async () => {
    const { listActiveFeatures } = await import('./factory-metrics');
    const rows = await listActiveFeatures();
    expect(rows.length).toBe(1);
    expect(rows[0].external_id).toBe('T000500');
    expect(rows[0].priority).toBe('hoch');
    expect(rows[0].pipeline_slot).toBe(1);
  });

  it('listActiveFlags returns only enabled=false (dark) flags for the brand', async () => {
    const { listActiveFlags } = await import('./factory-metrics');
    const rows = await listActiveFlags('mentolder');
    expect(rows.map((r) => r.key)).toEqual(['dark-a']);
    expect(rows[0].enabled).toBe(false);
  });
});
