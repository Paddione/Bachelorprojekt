import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { clarifyItem } from './planning-office';

beforeEach(() => {
  query.mockReset();
  query.mockImplementation((sql: string) => {
    if (/SELECT id\b/.test(sql)) return Promise.resolve({ rows: [{ id: 'uuid-1' }], rowCount: 1 });
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
});

describe('clarifyItem', () => {
  it('returns false when the ticket is not found', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const ok = await clarifyItem('T999999', '## body', {}, {});
    expect(ok).toBe(false);
  });

  it('inserts a comment with author_label planning-office and the uuid', async () => {
    await clarifyItem('T000571', '## Klärungsrunde\n| a | b |', {}, {});
    const insert = query.mock.calls.find((c) => /INSERT INTO tickets\.ticket_comments/.test(c[0]));
    expect(insert).toBeTruthy();
    expect(insert![1]).toEqual(['uuid-1', '## Klärungsrunde\n| a | b |']);
  });

  it('updates readiness with jsonb merge when readinessUpdates is non-empty', async () => {
    await clarifyItem('T000571', 'b', { abhaengigkeiten_klar: true, offene_fragen_geklaert: true }, {});
    const upd = query.mock.calls.find((c) => /SET readiness = readiness \|\|/.test(c[0]));
    expect(upd).toBeTruthy();
    expect(JSON.parse(upd![1][0])).toEqual({ abhaengigkeiten_klar: true, offene_fragen_geklaert: true });
  });

  it('does NOT run a readiness update when readinessUpdates is empty', async () => {
    await clarifyItem('T000571', 'b', {}, {});
    expect(query.mock.calls.some((c) => /SET readiness = readiness \|\|/.test(c[0]))).toBe(false);
  });

  it('updates depends_on when opts.dependsOn is provided and non-empty', async () => {
    await clarifyItem('T000571', 'b', {}, { dependsOn: ['T000573'] });
    const upd = query.mock.calls.find((c) => /SET depends_on =/.test(c[0]));
    expect(upd![1][0]).toEqual(['T000573']);
  });

  it('updates effort when opts.effort is provided', async () => {
    await clarifyItem('T000571', 'b', {}, { effort: 'klein' });
    const upd = query.mock.calls.find((c) => /SET effort =/.test(c[0]));
    expect(upd![1][0]).toBe('klein');
  });

  it('returns true on success', async () => {
    const ok = await clarifyItem('T000571', 'b', { spec_skizziert: true }, {});
    expect(ok).toBe(true);
  });
});
