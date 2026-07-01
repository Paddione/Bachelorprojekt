import { describe, it, expect, vi, beforeEach } from 'vitest';

const { Pool, query, connect, clientQuery, clientRelease } = vi.hoisted(() => {
  const query = vi.fn(async (..._args: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> => ({ rows: [], rowCount: 0 }));
  const clientQuery = vi.fn(async (..._args: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> => ({ rows: [], rowCount: 0 }));
  const clientRelease = vi.fn();
  const connect = vi.fn(async (..._args: unknown[]) => ({ query: clientQuery, release: clientRelease }));
  class Pool {
    constructor(_opts: unknown) { /* ignore config */ }
    query(...a: unknown[]) { return query(...a); }
    connect(...a: unknown[]) { return connect(...a); }
    end() { return Promise.resolve(); }
  }
  return { Pool, query, connect, clientQuery, clientRelease };
});
vi.mock('pg', () => ({ default: { Pool }, Pool }));
vi.mock('dns', () => ({ default: { resolve4: vi.fn() }, resolve4: vi.fn() }));

import {
  getRoom,
  listRoomsForAdmin,
  listRoomsForCustomer,
  listRoomsWithInboxData,
  createRoom,
  updateRoom,
  addRoomMember,
  removeRoomMember,
  getRoomMembers,
  isRoomMember,
  getRoomMessages,
  addRoomMessage,
  markRoomMessagesRead,
  getCustomerByEmail,
  getCustomerById,
  ensureDirectRoomForCustomer,
  listAllCustomers,
} from './messaging-db-attachments';

function defaultQueryImpl() {
  return async (..._args: unknown[]) => ({ rows: [], rowCount: 0 });
}

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(defaultQueryImpl());
  connect.mockClear();
  clientQuery.mockReset();
  clientQuery.mockImplementation(defaultQueryImpl());
  clientRelease.mockClear();
});

describe('messaging-db-attachments: getRoom', () => {
  it('returns the room row when found', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/SELECT \* FROM chat_rooms WHERE id = \$1/.test(sql)) {
        return { rows: [{ id: 1, name: 'Team' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const room = await getRoom(1);
    expect(room).toEqual({ id: 1, name: 'Team' });
  });

  it('returns null when not found', async () => {
    const room = await getRoom(999);
    expect(room).toBeNull();
  });
});

describe('messaging-db-attachments: listRoomsForAdmin / listRoomsForCustomer', () => {
  it('listRoomsForAdmin joins members and groups by room', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/LEFT JOIN chat_room_members m ON m\.room_id = r\.id/.test(sql)) {
        return { rows: [{ id: 1, name: 'A', member_count: 3 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const rooms = await listRoomsForAdmin();
    expect(rooms).toEqual([{ id: 1, name: 'A', member_count: 3 }]);
  });

  it('listRoomsForCustomer filters by membership and excludes archived rooms', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/JOIN chat_room_members m ON m\.room_id = r\.id/.test(sql)) {
        expect(sql).toMatch(/r\.archived_at IS NULL/);
        expect(params).toEqual(['cust-1']);
        return { rows: [{ id: 2, name: 'B' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const rooms = await listRoomsForCustomer('cust-1');
    expect(rooms).toEqual([{ id: 2, name: 'B' }]);
  });
});

describe('messaging-db-attachments: listRoomsWithInboxData', () => {
  it('returns inbox items with unread counts', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/COALESCE\(unread\.cnt, 0\)::int AS "unreadCount"/.test(sql)) {
        expect(params).toEqual(['cust-1']);
        return {
          rows: [{ id: 1, name: 'Room', lastMessageBody: 'hi', lastMessageSenderName: 'Bob', lastMessageAt: new Date(), unreadCount: 2 }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const items = await listRoomsWithInboxData('cust-1');
    expect(items).toHaveLength(1);
    expect(items[0].unreadCount).toBe(2);
  });
});

describe('messaging-db-attachments: createRoom / updateRoom', () => {
  it('createRoom inserts and returns the row', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/INSERT INTO chat_rooms \(name, created_by\)/.test(sql)) {
        return { rows: [{ id: 3, name: params![0], created_by: params![1] }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const room = await createRoom('New Room', 'admin-1');
    expect(room).toEqual({ id: 3, name: 'New Room', created_by: 'admin-1' });
  });

  it('updateRoom updates name only when name is provided', async () => {
    await updateRoom(1, { name: 'Renamed' });
    const calls = query.mock.calls.map((c) => c[0] as string);
    expect(calls.some((s) => /UPDATE chat_rooms SET name = \$1 WHERE id = \$2/.test(s))).toBe(true);
    expect(calls.some((s) => /archived_at/.test(s))).toBe(false);
  });

  it('updateRoom archives the room with a timestamp when archived=true', async () => {
    await updateRoom(1, { archived: true });
    const call = query.mock.calls.find((c) => /archived_at = \$1/.test(c[0] as string));
    const params = call![1] as unknown[];
    expect(params[0]).toBeInstanceOf(Date);
    expect(params[1]).toBe(1);
  });

  it('updateRoom unarchives the room by setting archived_at to null', async () => {
    await updateRoom(1, { archived: false });
    const call = query.mock.calls.find((c) => /archived_at = \$1/.test(c[0] as string));
    const params = call![1] as unknown[];
    expect(params[0]).toBeNull();
  });

  it('updateRoom does nothing when neither field is provided', async () => {
    await updateRoom(1, {});
    expect(query).not.toHaveBeenCalled();
  });
});

describe('messaging-db-attachments: room membership', () => {
  it('addRoomMember inserts with ON CONFLICT DO NOTHING', async () => {
    await addRoomMember(1, 'cust-1');
    const call = query.mock.calls.find((c) => /INSERT INTO chat_room_members/.test(c[0] as string));
    expect(call![1]).toEqual([1, 'cust-1']);
  });

  it('removeRoomMember deletes the membership row', async () => {
    await removeRoomMember(1, 'cust-1');
    const call = query.mock.calls.find((c) => /DELETE FROM chat_room_members/.test(c[0] as string));
    expect(call![1]).toEqual([1, 'cust-1']);
  });

  it('getRoomMembers returns joined customer info', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/FROM chat_room_members m JOIN customers c/.test(sql)) {
        return { rows: [{ customer_id: 'c-1', name: 'Bob', email: 'bob@x.com' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const members = await getRoomMembers(1);
    expect(members).toEqual([{ customer_id: 'c-1', name: 'Bob', email: 'bob@x.com' }]);
  });

  it('isRoomMember returns true when a membership row exists', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/SELECT 1 FROM chat_room_members/.test(sql)) return { rows: [{ '?column?': 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    expect(await isRoomMember(1, 'cust-1')).toBe(true);
  });

  it('isRoomMember returns false when no membership row exists', async () => {
    expect(await isRoomMember(1, 'cust-missing')).toBe(false);
  });
});

describe('messaging-db-attachments: room messages', () => {
  it('getRoomMessages without afterId returns all messages ordered by id', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/WHERE room_id = \$1 ORDER BY id ASC/.test(sql) && !/id > \$2/.test(sql)) {
        expect(params).toEqual([1]);
        return { rows: [{ id: 1, body: 'hi' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const msgs = await getRoomMessages(1);
    expect(msgs).toEqual([{ id: 1, body: 'hi' }]);
  });

  it('getRoomMessages with afterId filters by id > afterId', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/WHERE room_id = \$1 AND id > \$2 ORDER BY id ASC/.test(sql)) {
        expect(params).toEqual([1, 5]);
        return { rows: [{ id: 6, body: 'new' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const msgs = await getRoomMessages(1, 5);
    expect(msgs).toEqual([{ id: 6, body: 'new' }]);
  });

  it('addRoomMessage inserts and returns the created row with sender_name', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/INSERT INTO chat_messages/.test(sql)) {
        return { rows: [{ id: 10, room_id: params![0], body: params![3], sender_name: 'Bob' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const msg = await addRoomMessage({ roomId: 1, senderId: 'admin-1', senderCustomerId: 'cust-1', body: 'hello' });
    expect(msg).toEqual({ id: 10, room_id: 1, body: 'hello', sender_name: 'Bob' });
  });

  it('addRoomMessage defaults senderCustomerId to null', async () => {
    await addRoomMessage({ roomId: 1, senderId: 'admin-1', body: 'system note' });
    const call = query.mock.calls.find((c) => /INSERT INTO chat_messages/.test(c[0] as string));
    expect((call![1] as unknown[])[2]).toBeNull();
  });

  it('markRoomMessagesRead marks unread messages up to a given id', async () => {
    await markRoomMessagesRead(1, 'cust-1', 42);
    const call = query.mock.calls.find((c) => /INSERT INTO chat_message_reads/.test(c[0] as string));
    expect(call![1]).toEqual([1, 42, 'cust-1']);
  });
});

describe('messaging-db-attachments: customer lookups', () => {
  it('getCustomerByEmail returns the matching customer', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/WHERE email = \$1/.test(sql)) return { rows: [{ id: 'c-1', name: 'Bob', email: 'bob@x.com' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    expect(await getCustomerByEmail('bob@x.com')).toEqual({ id: 'c-1', name: 'Bob', email: 'bob@x.com' });
  });

  it('getCustomerByEmail returns null when not found', async () => {
    expect(await getCustomerByEmail('missing@x.com')).toBeNull();
  });

  it('getCustomerById returns the matching customer', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/FROM customers WHERE id = \$1/.test(sql)) return { rows: [{ id: 'c-1', name: 'Bob', email: 'bob@x.com' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    expect(await getCustomerById('c-1')).toEqual({ id: 'c-1', name: 'Bob', email: 'bob@x.com' });
  });

  it('getCustomerById returns null when not found', async () => {
    expect(await getCustomerById('missing')).toBeNull();
  });

  it('listAllCustomers returns only customers with a keycloak_user_id', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/keycloak_user_id IS NOT NULL/.test(sql)) return { rows: [{ id: 'c-1', name: 'Bob', email: 'bob@x.com' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    expect(await listAllCustomers()).toEqual([{ id: 'c-1', name: 'Bob', email: 'bob@x.com' }]);
  });
});

describe('messaging-db-attachments: ensureDirectRoomForCustomer', () => {
  it('returns the existing direct room without opening a transaction', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/direct_customer_id = \$1 AND is_direct = TRUE/.test(sql)) {
        return { rows: [{ id: 7 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const result = await ensureDirectRoomForCustomer('cust-1', 'Bob', 'admin-1');
    expect(result).toEqual({ room_id: 7, customer_id: 'cust-1' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('creates a new direct room and membership inside a transaction when none exists', async () => {
    clientQuery.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/INSERT INTO chat_rooms/.test(sql)) {
        return { rows: [{ id: 8, name: params![0], is_direct: true, direct_customer_id: params![2] }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const result = await ensureDirectRoomForCustomer('cust-2', 'Alice', 'admin-1');
    expect(result).toEqual({ room_id: 8, customer_id: 'cust-2' });
    const calls = clientQuery.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toMatch(/BEGIN/);
    expect(calls.some((s) => /INSERT INTO chat_room_members/.test(s))).toBe(true);
    expect(calls[calls.length - 1]).toMatch(/COMMIT/);
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });

  it('rolls back the transaction when room creation fails', async () => {
    clientQuery.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/INSERT INTO chat_rooms/.test(sql)) throw new Error('insert failed');
      return { rows: [], rowCount: 0 };
    });
    await expect(ensureDirectRoomForCustomer('cust-3', 'Carl', 'admin-1')).rejects.toThrow('insert failed');
    const calls = clientQuery.mock.calls.map((c) => c[0] as string);
    expect(calls.some((s) => /ROLLBACK/.test(s))).toBe(true);
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });
});
