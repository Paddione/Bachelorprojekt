// Regression test for T001351 — createTimeEntry() bypasses the entry_date column
// DEFAULT (CURRENT_DATE) because it always sends an explicit parameter value
// (`params.entryDate ?? null`) for entry_date. Postgres only applies a column
// DEFAULT when the column is omitted from the INSERT entirely — sending an
// explicit SQL NULL instead violates the `entry_date DATE NOT NULL DEFAULT
// CURRENT_DATE` constraint and the insert fails outright when no entryDate is
// supplied by the caller.
//
// Fix: wrap the entry_date parameter slot in COALESCE($8::date, CURRENT_DATE)
// so a missing entryDate falls back to CURRENT_DATE inside the query itself,
// instead of relying on the (bypassed) column DEFAULT.
//
// This test asserts the query TEXT contains the COALESCE fallback — a
// structural assertion, not a live-DB constraint-violation repro. A pg-mock
// (`vi.fn`) has no constraint semantics, so it cannot itself throw a NOT NULL
// violation; the query-shape assertion is what actually pins down the bug
// (missing COALESCE => raw $8 is sent => the DEFAULT is bypassed).

import { describe, it, expect, vi, beforeEach } from 'vitest';

type PgMock = { poolQuery: ReturnType<typeof vi.fn> };
type TestGlobals = { __pgMockTimeEntries?: PgMock };

let poolQuery: ReturnType<typeof vi.fn>;

vi.mock('pg', () => {
  const _poolQuery = vi.fn();

  function Pool(this: { query: ReturnType<typeof vi.fn> }) {
    this.query = _poolQuery;
    (globalThis as unknown as TestGlobals).__pgMockTimeEntries = { poolQuery: _poolQuery };
  }
  return { default: { Pool } };
});

// initTimeEntriesTable() calls initTicketsSchema() first — stub it out so this
// test stays focused on the entry_date INSERT and doesn't need to mock the
// full tickets schema init (advisory locks, client.connect(), etc.).
vi.mock('./tickets-schema', () => ({
  initTicketsSchema: vi.fn().mockResolvedValue(undefined),
}));

import { createTimeEntry } from './website-db';

beforeEach(() => {
  const m = (globalThis as unknown as TestGlobals).__pgMockTimeEntries!;
  poolQuery = m.poolQuery;
  poolQuery.mockReset();
  poolQuery.mockImplementation((text: unknown) => {
    const sql = typeof text === 'string' ? text : '';
    if (sql.includes('INSERT INTO time_entries')) {
      return Promise.resolve({
        rows: [
          {
            id: 'te-1',
            projectId: 'p1',
            projectName: null,
            taskId: null,
            taskName: null,
            description: null,
            minutes: 30,
            billable: true,
            rateCents: 0,
            leistungKey: null,
            stripeInvoiceId: null,
            entryDate: '2026-07-01',
            createdAt: new Date('2026-07-01T00:00:00Z'),
          },
        ],
      });
    }
    // CREATE TABLE / CREATE INDEX / ALTER TABLE schema-init statements.
    return Promise.resolve({ rows: [] });
  });
});

describe('createTimeEntry entry_date default (T001351)', () => {
  it('wraps the entry_date parameter in COALESCE(..., CURRENT_DATE) so the column DEFAULT is not bypassed', async () => {
    await createTimeEntry({ projectId: 'p1', minutes: 30 });

    const insertCall = poolQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO time_entries')
    );
    expect(insertCall).toBeDefined();
    const queryText = insertCall![0] as string;

    // RED today: the query sends a raw `$8` placeholder for entry_date, which
    // becomes SQL NULL when entryDate is omitted — bypassing the column
    // DEFAULT CURRENT_DATE and violating the NOT NULL constraint.
    // GREEN after the fix: entry_date is wrapped in COALESCE($8::date,
    // CURRENT_DATE), so a missing entryDate falls back to today's date.
    expect(queryText).toContain('COALESCE($8::date, CURRENT_DATE)');
  });
});
