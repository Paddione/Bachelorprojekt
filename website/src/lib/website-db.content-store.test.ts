import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable references to the query fns, assigned after hoisted mock runs
let poolQuery: ReturnType<typeof vi.fn>;
let clientQuery: ReturnType<typeof vi.fn>;
let clientRelease: ReturnType<typeof vi.fn>;

vi.mock('pg', () => {
  // These must be created fresh inside the factory (vi.mock is hoisted)
  const _poolQuery = vi.fn();
  const _clientQuery = vi.fn();
  const _release = vi.fn();

  function Pool(this: any) {
    this.query = _poolQuery;
    this.connect = async () => ({ query: _clientQuery, release: _release });
    // Store refs so tests can access them after import
    (globalThis as any).__pgMock = { poolQuery: _poolQuery, clientQuery: _clientQuery, release: _release };
  }
  return { default: { Pool } };
});

import { readContent, writeContent } from './website-db';

beforeEach(() => {
  const m = (globalThis as any).__pgMock;
  poolQuery = m.poolQuery;
  clientQuery = m.clientQuery;
  clientRelease = m.release;
  poolQuery.mockReset();
  clientQuery.mockReset();
  clientRelease.mockReset();
});

describe('readContent', () => {
  it('returns the value + version for a site_setting', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ value: '{"footerEmail":"a@b.de"}', version: 2 }] });
    const r = await readContent('mentolder', 'kontakt');
    expect(r).toEqual({ value: { footerEmail: 'a@b.de' }, version: 2 });
  });
  it('returns version 0 + null value when absent', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    expect(await readContent('mentolder', 'kontakt')).toEqual({ value: null, version: 0 });
  });
});

describe('writeContent', () => {
  it('rejects on a stale base version (conflict)', async () => {
    // BEGIN
    clientQuery.mockResolvedValueOnce({});
    // liveRead inside transaction: current version is 3
    clientQuery.mockResolvedValueOnce({ rows: [{ value: '{}', version: 3 }] });
    // ROLLBACK
    clientQuery.mockResolvedValueOnce({});

    await expect(writeContent('mentolder', 'kontakt', { x: 1 }, 2, 'gekko'))
      .rejects.toMatchObject({ code: 'CONFLICT', currentVersion: 3 });
  });
});
