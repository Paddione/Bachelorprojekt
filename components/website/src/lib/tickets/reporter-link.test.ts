import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../db-pool', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { linkReporterByEmail, linkAllReporters } from './reporter-link';

beforeEach(() => query.mockReset());

describe('tickets/reporter-link', () => {
  it('linkReporterByEmail: short-circuits on falsy email (no DB call)', async () => {
    expect(await linkReporterByEmail('')).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('linkReporterByEmail: returns rowCount on success', async () => {
    query.mockResolvedValueOnce({ rowCount: 3, rows: [] });
    expect(await linkReporterByEmail('a@b.de')).toBe(3);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/UPDATE tickets\.tickets/);
    expect(sql).toMatch(/c\.keycloak_user_id IS NOT NULL/);
    expect(params).toEqual(['a@b.de']);
  });

  it('linkReporterByEmail: falls back to 0 when rowCount is null/undefined', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await linkReporterByEmail('x@y.de')).toBe(0);
  });

  it('linkAllReporters: bulk-joins by reporter_email and reports the rowCount', async () => {
    query.mockResolvedValueOnce({ rowCount: 7, rows: [] });
    expect(await linkAllReporters()).toBe(7);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/t\.reporter_id IS NULL/);
    expect(sql).toMatch(/c\.email = t\.reporter_email/);
    expect(sql).toMatch(/c\.keycloak_user_id IS NOT NULL/);
  });
});
