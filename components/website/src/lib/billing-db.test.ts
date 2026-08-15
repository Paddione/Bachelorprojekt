// website/src/lib/billing-db.test.ts
//
// billing-db.ts is pure sequential DDL executed via pool.query(...), guarded
// by module-level "ready" caches that are not exported/resettable. To test
// the "first call runs DDL, second call is a cached no-op" behavior for each
// exported init function independently, each test resets the module registry
// and re-imports the module fresh (vi.mock hoisting still applies after
// vi.resetModules() within the same test file).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./db-pool', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
}));

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
  vi.resetModules();
});

describe('initBillingTables', () => {
  it('first call issues many DDL queries; second call is a cached no-op', async () => {
    const { initBillingTables } = await import('./billing-db');
    await initBillingTables();
    const firstCallCount = query.mock.calls.length;
    expect(firstCallCount).toBeGreaterThan(20);

    query.mockClear();
    await initBillingTables();
    expect(query).not.toHaveBeenCalled();
  });

  it('swallows a 42501 (insufficient_privilege) error from the trigger-install query', async () => {
    query.mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('CREATE OR REPLACE FUNCTION billing_invoices_immutable')) {
        throw Object.assign(new Error('permission denied'), { code: '42501' });
      }
      return { rows: [] };
    });
    const { initBillingTables } = await import('./billing-db');
    await expect(initBillingTables()).resolves.toBeUndefined();
  });

  it('rethrows a non-42501 error from the trigger-install query', async () => {
    query.mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('CREATE OR REPLACE FUNCTION billing_invoices_immutable')) {
        throw Object.assign(new Error('syntax error'), { code: '42601' });
      }
      return { rows: [] };
    });
    const { initBillingTables } = await import('./billing-db');
    await expect(initBillingTables()).rejects.toThrow('syntax error');
  });
});

describe('initTaxMonitorTables', () => {
  it('first call runs DDL; second call is cached (no new queries)', async () => {
    const { initTaxMonitorTables } = await import('./billing-db');
    await initTaxMonitorTables();
    expect(query.mock.calls.length).toBeGreaterThan(0);

    query.mockClear();
    await initTaxMonitorTables();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('initEurTables', () => {
  it('first call runs DDL for eur_bookings and assets; second call is cached', async () => {
    const { initEurTables } = await import('./billing-db');
    await initEurTables();
    const calls = query.mock.calls.map(c => String(c[0]));
    expect(calls.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS eur_bookings'))).toBe(true);
    expect(calls.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS assets'))).toBe(true);

    query.mockClear();
    await initEurTables();
    expect(query).not.toHaveBeenCalled();
  });
});
