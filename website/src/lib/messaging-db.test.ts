import { describe, it, expect, vi, beforeEach } from 'vitest';

const { Pool, query, end } = vi.hoisted(() => {
  const query = vi.fn(async (..._args: unknown[]) => ({ rows: [], rowCount: 0 }));
  const end = vi.fn(async () => undefined);
  class Pool {
    constructor(_opts: unknown) { /* ignore config */ }
    query(...a: [...unknown[]]) { return query(...a); }
    end(...a: [...unknown[]]) { return end(...a); }
  }
  return { Pool, query, end };
});
vi.mock('pg', () => ({ default: { Pool }, Pool }));
vi.mock('dns', () => ({ default: { resolve4: vi.fn() }, resolve4: vi.fn() }));

import { createInboxItem, deleteInboxItem, listInboxItems } from './messaging-db';

beforeEach(() => { query.mockClear(); end.mockClear(); });

describe('messaging-db (pg.Pool mocked)', () => {
  it('createInboxItem: INSERT with reference_id, reference_table, bug_ticket_id, payload, is_test_data', async () => {
    await createInboxItem({
      type: 'contact',
      referenceId: 'r-1',
      referenceTable: 't',
      bugTicketId: 'bt-1',
      payload: { name: 'A' },
      isTestData: true,
    });
    const insertCall = query.mock.calls.find(c => /INSERT INTO inbox_items/.test(c[0] as string));
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[0]).toBe('contact');
    expect(params[1]).toBe('r-1');
    expect(params[2]).toBe('t');
    expect(params[3]).toBe('bt-1');
    expect(params[4]).toEqual({ name: 'A' });
    expect(params[5]).toBe(true);
  });

  it('createInboxItem: defaults reference/table/bug/isTestData', async () => {
    await createInboxItem({ type: 'bug', payload: { x: 1 } });
    const insertCall = query.mock.calls.find(c => /INSERT INTO inbox_items/.test(c[0] as string));
    const params = insertCall![1] as unknown[];
    expect(params[1]).toBeNull();
    expect(params[2]).toBeNull();
    expect(params[3]).toBeNull();
    expect(params[5]).toBe(false);
  });

  it('deleteInboxItem: DELETE returns rowCount', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const out = await deleteInboxItem(7);
    expect(out).toBe(1);
  });

  it('listInboxItems: no filter → all rows', async () => {
    await listInboxItems({});
    const calls = query.mock.calls.map(c => c[0] as string);
    expect(calls.some(s => /FROM inbox_items/.test(s))).toBe(true);
  });

  it('listInboxItems: status filter → WHERE status = $1', async () => {
    await listInboxItems({ status: 'pending' });
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const inboxCall = calls.find(c => /FROM inbox_items/.test(c.sql));
    expect(inboxCall).toBeDefined();
    expect(inboxCall!.sql).toMatch(/WHERE status = \$1/);
    expect(inboxCall!.params).toEqual(['pending']);
  });

  it('listInboxItems: type filter → WHERE type = $1', async () => {
    await listInboxItems({ type: 'contact' });
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const inboxCall = calls.find(c => /FROM inbox_items/.test(c.sql));
    expect(inboxCall!.sql).toMatch(/WHERE type = \$1/);
    expect(inboxCall!.params).toEqual(['contact']);
  });

  it('listInboxItems: combines status + type', async () => {
    await listInboxItems({ status: 'pending', type: 'bug' });
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const inboxCall = calls.find(c => /FROM inbox_items/.test(c.sql));
    expect(inboxCall!.sql).toMatch(/status = \$1/);
    expect(inboxCall!.sql).toMatch(/type = \$2/);
    expect(inboxCall!.params).toEqual(['pending', 'bug']);
  });
});
