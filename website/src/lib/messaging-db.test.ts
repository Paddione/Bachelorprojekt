import { describe, it, expect, vi, beforeEach } from 'vitest';

const { Pool, query, end, connect, clientQuery, clientRelease } = vi.hoisted(() => {
  const query = vi.fn(async (..._args: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> => ({ rows: [], rowCount: 0 }));
  const end = vi.fn(async (..._args: unknown[]) => undefined);
  const clientQuery = vi.fn(async (..._args: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> => ({ rows: [], rowCount: 0 }));
  const clientRelease = vi.fn();
  const connect = vi.fn(async (..._args: unknown[]) => ({ query: clientQuery, release: clientRelease }));
  class Pool {
    constructor(_opts: unknown) { /* ignore config */ }
    query(...a: unknown[]) { return query(...a); }
    connect(...a: unknown[]) { return connect(...a); }
    end(...a: unknown[]) { return end(...a); }
  }
  return { Pool, query, end, connect, clientQuery, clientRelease };
});
vi.mock('pg', () => ({ default: { Pool }, Pool }));
vi.mock('dns', () => ({ default: { resolve4: vi.fn() }, resolve4: vi.fn() }));

import {
  createInboxItem,
  deleteInboxItem,
  listInboxItems,
  getInboxItem,
  updateInboxItemStatus,
  countPendingByType,
  listThreadsForAdmin,
  getOrCreateThreadForCustomer,
  getThread,
  getThreadMessages,
  addMessage,
  markThreadRead,
  getThreadByCustomerId,
} from './messaging-db';

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async (..._args: unknown[]) => ({ rows: [], rowCount: 0 }));
  end.mockClear();
  connect.mockClear();
  clientQuery.mockReset();
  clientQuery.mockImplementation(async (..._args: unknown[]) => ({ rows: [], rowCount: 0 }));
  clientRelease.mockClear();
});

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

  it('getInboxItem: returns the matching row', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/FROM inbox_items WHERE id = \$1/.test(sql)) return { rows: [{ id: 3, type: 'bug' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    expect(await getInboxItem(3)).toEqual({ id: 3, type: 'bug' });
  });

  it('getInboxItem: returns null when not found', async () => {
    expect(await getInboxItem(999)).toBeNull();
  });

  it('updateInboxItemStatus: sets actioned_at when status is not pending', async () => {
    await updateInboxItemStatus(5, 'actioned', 'admin-1');
    const call = query.mock.calls.find((c) => /UPDATE inbox_items/.test(c[0] as string));
    const params = call![1] as unknown[];
    expect(params[0]).toBe('actioned');
    expect(params[1]).toBeInstanceOf(Date);
    expect(params[2]).toBe('admin-1');
    expect(params[3]).toBe(5);
  });

  it('updateInboxItemStatus: nulls actioned_at/actioned_by when reverting to pending', async () => {
    await updateInboxItemStatus(5, 'pending');
    const call = query.mock.calls.find((c) => /UPDATE inbox_items/.test(c[0] as string));
    const params = call![1] as unknown[];
    expect(params[1]).toBeNull();
    expect(params[2]).toBeNull();
  });
});

describe('messaging-db: countPendingByType', () => {
  it('aggregates pending counts per type', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/GROUP BY type/.test(sql)) {
        return { rows: [{ type: 'contact', count: '3' }, { type: 'bug', count: '1' }], rowCount: 2 };
      }
      return { rows: [], rowCount: 0 };
    });
    const counts = await countPendingByType();
    expect(counts).toEqual({ contact: 3, bug: 1 });
  });

  it('returns an empty object when there are no pending rows', async () => {
    const counts = await countPendingByType();
    expect(counts).toEqual({});
  });
});

describe('messaging-db: threads', () => {
  it('listThreadsForAdmin: joins customer info and unread counts', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/FROM message_threads t/.test(sql)) {
        return { rows: [{ id: 1, customer_id: 'c-1', customer_name: 'Bob', unread_count: '2' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const threads = await listThreadsForAdmin();
    expect(threads).toEqual([{ id: 1, customer_id: 'c-1', customer_name: 'Bob', unread_count: '2' }]);
  });

  it('getOrCreateThreadForCustomer: returns the existing thread without inserting', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/SELECT \* FROM message_threads WHERE customer_id = \$1 LIMIT 1/.test(sql)) {
        return { rows: [{ id: 1, customer_id: 'c-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const thread = await getOrCreateThreadForCustomer('c-1');
    expect(thread).toEqual({ id: 1, customer_id: 'c-1' });
    expect(query.mock.calls.some((c) => /INSERT INTO message_threads/.test(c[0] as string))).toBe(false);
  });

  it('getOrCreateThreadForCustomer: creates a new thread with is_test_data flag when none exists', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/SELECT \* FROM message_threads WHERE customer_id = \$1 LIMIT 1/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/INSERT INTO message_threads/.test(sql)) {
        return { rows: [{ id: 2, customer_id: params![0], is_test_data: params![1] }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const thread = await getOrCreateThreadForCustomer('c-2', { isTestData: true });
    expect(thread).toEqual({ id: 2, customer_id: 'c-2', is_test_data: true });
  });

  it('getThread: returns the thread joined with customer info', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/FROM message_threads t[\s\S]*WHERE t\.id = \$1/.test(sql)) {
        return { rows: [{ id: 1, customer_name: 'Bob' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    expect(await getThread(1)).toEqual({ id: 1, customer_name: 'Bob' });
  });

  it('getThread: returns null when the thread does not exist', async () => {
    expect(await getThread(999)).toBeNull();
  });

  it('getThreadMessages: returns messages ordered by id', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/FROM messages WHERE thread_id = \$1 ORDER BY id ASC/.test(sql)) {
        expect(params).toEqual([1]);
        return { rows: [{ id: 1, body: 'hi' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    expect(await getThreadMessages(1)).toEqual([{ id: 1, body: 'hi' }]);
  });

  it('getThreadByCustomerId: returns the matching thread', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/FROM message_threads WHERE customer_id = \$1 LIMIT 1/.test(sql)) {
        return { rows: [{ id: 4, customer_id: 'c-4' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    expect(await getThreadByCustomerId('c-4')).toEqual({ id: 4, customer_id: 'c-4' });
  });

  it('getThreadByCustomerId: returns null when no thread exists', async () => {
    expect(await getThreadByCustomerId('missing')).toBeNull();
  });

  it('markThreadRead: marks user messages read when reader is admin', async () => {
    await markThreadRead(1, 'admin');
    const call = query.mock.calls.find((c) => /UPDATE messages SET read_at = now\(\)/.test(c[0] as string));
    expect(call![1]).toEqual([1, 'user']);
  });

  it('markThreadRead: marks admin messages read when reader is user', async () => {
    await markThreadRead(1, 'user');
    const call = query.mock.calls.find((c) => /UPDATE messages SET read_at = now\(\)/.test(c[0] as string));
    expect(call![1]).toEqual([1, 'admin']);
  });
});

describe('messaging-db: addMessage', () => {
  it('inserts the message, bumps last_message_at, and commits', async () => {
    clientQuery.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/INSERT INTO messages/.test(sql)) {
        return { rows: [{ id: 1, thread_id: params![0], body: params![4] }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const msg = await addMessage({ threadId: 1, senderId: 'admin-1', senderRole: 'admin', body: 'hello' });
    expect(msg).toEqual({ id: 1, thread_id: 1, body: 'hello' });

    const calls = clientQuery.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toMatch(/BEGIN/);
    expect(calls.some((s) => /UPDATE message_threads SET last_message_at = now\(\)/.test(s))).toBe(true);
    expect(calls.some((s) => /UPDATE message_threads SET is_test_data = true/.test(s))).toBe(false);
    expect(calls[calls.length - 1]).toMatch(/COMMIT/);
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });

  it('promotes the parent thread is_test_data flag when isTestData is true', async () => {
    clientQuery.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/INSERT INTO messages/.test(sql)) return { rows: [{ id: 2 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await addMessage({ threadId: 1, senderId: 'user-1', senderRole: 'user', body: 'hi', isTestData: true });
    const calls = clientQuery.mock.calls.map((c) => c[0] as string);
    expect(calls.some((s) => /UPDATE message_threads SET is_test_data = true/.test(s))).toBe(true);
  });

  it('rolls back and rethrows when the insert fails', async () => {
    clientQuery.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/INSERT INTO messages/.test(sql)) throw new Error('insert failed');
      return { rows: [], rowCount: 0 };
    });
    await expect(addMessage({ threadId: 1, senderId: 'admin-1', senderRole: 'admin', body: 'x' })).rejects.toThrow('insert failed');
    const calls = clientQuery.mock.calls.map((c) => c[0] as string);
    expect(calls.some((s) => /ROLLBACK/.test(s))).toBe(true);
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });
});
