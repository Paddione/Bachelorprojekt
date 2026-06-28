// website/src/lib/messaging-db.ts
// DB operations for the inbox, messaging, and chat room system.
// Uses the same shared-db connection as website-db.ts.

import { pool } from './messaging-db-pool';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InboxType =
  | 'registration' | 'booking' | 'contact' | 'bug' | 'meeting_finalize' | 'user_message';
export type InboxStatus = 'pending' | 'actioned' | 'archived';

export interface InboxItem {
  id: number;
  type: InboxType;
  status: InboxStatus;
  reference_id: string | null;
  reference_table: string | null;
  bug_ticket_id: string | null;
  payload: Record<string, unknown>;
  created_at: Date;
  actioned_at: Date | null;
  actioned_by: string | null;
  is_test_data: boolean;
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

export async function createInboxItem(params: {
  type: InboxType;
  referenceId?: string;
  referenceTable?: string;
  bugTicketId?: string;
  payload: Record<string, unknown>;
  /** When true, stamps the row as test-data so
   *  tickets.fn_purge_test_data() reaps it on the next bracket. Set by
   *  the public form endpoints (/api/contact, /api/booking, /api/bug-report,
   *  /api/portal/messages) when the request carries the X-E2E-Test header
   *  + valid X-Cron-Secret. Defaults to false. */
  isTestData?: boolean;
}): Promise<InboxItem> {
  const { rows } = await pool.query<InboxItem>(
    `INSERT INTO inbox_items (type, reference_id, reference_table, bug_ticket_id, payload, is_test_data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.type,
      params.referenceId ?? null,
      params.referenceTable ?? null,
      params.bugTicketId ?? null,
      params.payload,
      params.isTestData === true,
    ],
  );
  return rows[0];
}

/**
 * Hard-delete an inbox row regardless of status. Used by the admin "Löschen"
 * escape hatch — rows that have already been actioned/archived have no other
 * path to disappear from the queue, and over time these accumulate (paddione
 * had 27 such rows on mentolder before this lever existed).
 *
 * Returns the number of rows affected (0 if id was unknown).
 */
export async function deleteInboxItem(id: number): Promise<number> {
  const r = await pool.query('DELETE FROM inbox_items WHERE id = $1', [id]);
  return r.rowCount ?? 0;
}

export async function listInboxItems(filter: {
  status?: InboxStatus;
  type?: InboxType;
}): Promise<InboxItem[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filter.status) {
    conditions.push(`status = $${conditions.length + 1}`);
    values.push(filter.status);
  }
  if (filter.type) {
    conditions.push(`type = $${conditions.length + 1}`);
    values.push(filter.type);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query<InboxItem>(
    `SELECT * FROM inbox_items ${where} ORDER BY created_at DESC`,
    values,
  );
  return rows;
}

export async function getInboxItem(id: number): Promise<InboxItem | null> {
  const { rows } = await pool.query<InboxItem>(
    'SELECT * FROM inbox_items WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function updateInboxItemStatus(
  id: number,
  status: InboxStatus,
  actionedBy?: string,
): Promise<void> {
  await pool.query(
    `UPDATE inbox_items
     SET status = $1, actioned_at = $2, actioned_by = $3
     WHERE id = $4`,
    [status, status !== 'pending' ? new Date() : null, actionedBy ?? null, id],
  );
}

export async function countPendingByType(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ type: string; count: string }>(
    `SELECT type, count(*) AS count FROM inbox_items WHERE status = 'pending' GROUP BY type`,
  );
  const out: Record<string, number> = {};
  for (const row of rows) out[row.type] = parseInt(row.count, 10);
  return out;
}


// ── Thread types ──────────────────────────────────────────────────────────────

export interface MessageThread {
  id: number;
  customer_id: string;
  subject: string | null;
  created_at: Date;
  last_message_at: Date;
  is_test_data?: boolean;
  customer_name?: string;
  customer_email?: string;
  unread_count?: number;
}

export interface Message {
  id: number;
  thread_id: number;
  sender_id: string;
  sender_role: 'admin' | 'user';
  sender_customer_id: string | null;
  body: string;
  created_at: Date;
  read_at: Date | null;
  is_test_data?: boolean;
}

import type { ChatRoom, ChatMessage, RoomInboxItem } from './messaging-db-attachments';
export type { ChatRoom, ChatMessage, RoomInboxItem };

// ── Thread functions ──────────────────────────────────────────────────────────

export async function listThreadsForAdmin(): Promise<MessageThread[]> {
  const { rows } = await pool.query<MessageThread>(
    `SELECT t.*, c.name AS customer_name, c.email AS customer_email,
            COUNT(m.id) FILTER (WHERE m.sender_role = 'user' AND m.read_at IS NULL) AS unread_count
     FROM message_threads t
     LEFT JOIN customers c ON c.id = t.customer_id
     LEFT JOIN messages m ON m.thread_id = t.id
     GROUP BY t.id, c.name, c.email
     ORDER BY t.last_message_at DESC`,
  );
  return rows;
}

export async function getOrCreateThreadForCustomer(
  customerId: string,
  opts: { isTestData?: boolean } = {},
): Promise<MessageThread> {
  const existing = await pool.query<MessageThread>(
    'SELECT * FROM message_threads WHERE customer_id = $1 LIMIT 1',
    [customerId],
  );
  if (existing.rows.length) return existing.rows[0];
  const { rows } = await pool.query<MessageThread>(
    'INSERT INTO message_threads (customer_id, is_test_data) VALUES ($1, $2) RETURNING *',
    [customerId, opts.isTestData === true],
  );
  return rows[0];
}

export async function getThread(threadId: number): Promise<MessageThread | null> {
  const { rows } = await pool.query<MessageThread>(
    `SELECT t.*, c.name AS customer_name, c.email AS customer_email
     FROM message_threads t
     LEFT JOIN customers c ON c.id = t.customer_id
     WHERE t.id = $1`,
    [threadId],
  );
  return rows[0] ?? null;
}

export async function getThreadMessages(threadId: number): Promise<Message[]> {
  const { rows } = await pool.query<Message>(
    'SELECT * FROM messages WHERE thread_id = $1 ORDER BY id ASC',
    [threadId],
  );
  return rows;
}

export async function addMessage(params: {
  threadId: number;
  senderId: string;
  senderRole: 'admin' | 'user';
  senderCustomerId?: string;
  body: string;
  /** When true, stamps the message row (and its parent thread, if not yet
   *  stamped) so the test-data purge reaps both. */
  isTestData?: boolean;
}): Promise<Message> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<Message>(
      `INSERT INTO messages (thread_id, sender_id, sender_role, sender_customer_id, body, is_test_data)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        params.threadId,
        params.senderId,
        params.senderRole,
        params.senderCustomerId ?? null,
        params.body,
        params.isTestData === true,
      ],
    );
    await client.query(
      'UPDATE message_threads SET last_message_at = now() WHERE id = $1',
      [params.threadId],
    );
    if (params.isTestData === true) {
      // Promote the parent thread's flag so the purge sweep reaps it via
      // `WHERE is_test_data = true` rather than a join through messages.
      await client.query(
        `UPDATE message_threads SET is_test_data = true
         WHERE id = $1 AND is_test_data = false`,
        [params.threadId],
      );
    }
    await client.query('COMMIT');
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function markThreadRead(threadId: number, readerRole: 'admin' | 'user'): Promise<void> {
  // Mark messages sent by the OTHER role as read
  const senderRole = readerRole === 'admin' ? 'user' : 'admin';
  await pool.query(
    `UPDATE messages SET read_at = now()
     WHERE thread_id = $1 AND sender_role = $2 AND read_at IS NULL`,
    [threadId, senderRole],
  );
}

export async function getThreadByCustomerId(customerId: string): Promise<MessageThread | null> {
  const { rows } = await pool.query<MessageThread>(
    'SELECT * FROM message_threads WHERE customer_id = $1 LIMIT 1',
    [customerId],
  );
  return rows[0] ?? null;
}

export {
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
