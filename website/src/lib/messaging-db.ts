// website/src/lib/messaging-db.ts
// DB operations for the inbox, messaging, and chat room system.
// Uses the same shared-db connection as website-db.ts.

import pg from 'pg';
import { resolve4 } from 'dns';
const { Pool } = pg;

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

const pool = new Pool({ connectionString: DB_URL, lookup: nodeLookup } as unknown as import('pg').PoolConfig);

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
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

export async function createInboxItem(params: {
  type: InboxType;
  referenceId?: string;
  referenceTable?: string;
  bugTicketId?: string;
  payload: Record<string, unknown>;
}): Promise<InboxItem> {
  const { rows } = await pool.query<InboxItem>(
    `INSERT INTO inbox_items (type, reference_id, reference_table, bug_ticket_id, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [params.type, params.referenceId ?? null, params.referenceTable ?? null, params.bugTicketId ?? null, params.payload],
  );
  return rows[0];
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
}

// ── Room types ────────────────────────────────────────────────────────────────

export interface ChatRoom {
  id: number;
  name: string;
  created_by: string;
  created_at: Date;
  archived_at: Date | null;
  is_direct: boolean;
  direct_customer_id: string | null;
  member_count?: number;
}

export interface ChatMessage {
  id: number;
  room_id: number;
  sender_id: string;
  sender_name: string;
  sender_customer_id: string | null;
  body: string;
  created_at: Date;
}

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

export async function getOrCreateThreadForCustomer(customerId: string): Promise<MessageThread> {
  const existing = await pool.query<MessageThread>(
    'SELECT * FROM message_threads WHERE customer_id = $1 LIMIT 1',
    [customerId],
  );
  if (existing.rows.length) return existing.rows[0];
  const { rows } = await pool.query<MessageThread>(
    'INSERT INTO message_threads (customer_id) VALUES ($1) RETURNING *',
    [customerId],
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
}): Promise<Message> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<Message>(
      `INSERT INTO messages (thread_id, sender_id, sender_role, sender_customer_id, body) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [params.threadId, params.senderId, params.senderRole, params.senderCustomerId ?? null, params.body],
    );
    await client.query(
      'UPDATE message_threads SET last_message_at = now() WHERE id = $1',
      [params.threadId],
    );
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

// ── Room functions ────────────────────────────────────────────────────────────

export async function getRoom(id: number): Promise<ChatRoom | null> {
  const { rows } = await pool.query<ChatRoom>(
    'SELECT * FROM chat_rooms WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function listRoomsForAdmin(): Promise<ChatRoom[]> {
  const { rows } = await pool.query<ChatRoom>(
    `SELECT r.*, count(m.customer_id) AS member_count
     FROM chat_rooms r
     LEFT JOIN chat_room_members m ON m.room_id = r.id
     GROUP BY r.id
     ORDER BY r.created_at DESC`,
  );
  return rows;
}

export async function listRoomsForCustomer(customerId: string): Promise<ChatRoom[]> {
  const { rows } = await pool.query<ChatRoom>(
    `SELECT r.* FROM chat_rooms r
     JOIN chat_room_members m ON m.room_id = r.id
     WHERE m.customer_id = $1 AND r.archived_at IS NULL
     ORDER BY r.created_at DESC`,
    [customerId],
  );
  return rows;
}

export interface RoomInboxItem {
  id: number;
  name: string;
  lastMessageBody: string | null;
  lastMessageSenderName: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
}

export async function listRoomsWithInboxData(customerId: string): Promise<RoomInboxItem[]> {
  const { rows } = await pool.query<RoomInboxItem>(
    `SELECT
       r.id,
       r.name,
       lm.body                AS "lastMessageBody",
       lm.sender_name         AS "lastMessageSenderName",
       lm.created_at          AS "lastMessageAt",
       COALESCE(unread.cnt, 0)::int AS "unreadCount"
     FROM chat_rooms r
     JOIN chat_room_members m ON m.room_id = r.id AND m.customer_id = $1
     LEFT JOIN LATERAL (
       SELECT body, sender_name, created_at
       FROM chat_messages
       WHERE room_id = r.id
       ORDER BY id DESC
       LIMIT 1
     ) lm ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt
       FROM chat_messages cm
       WHERE cm.room_id = r.id
         AND (cm.sender_customer_id IS NULL OR cm.sender_customer_id <> $1)
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_reads cr
           WHERE cr.message_id = cm.id AND cr.customer_id = $1
         )
     ) unread ON true
     WHERE r.archived_at IS NULL
     ORDER BY COALESCE(lm.created_at, r.created_at) DESC`,
    [customerId],
  );
  return rows;
}

export async function createRoom(name: string, createdBy: string): Promise<ChatRoom> {
  const { rows } = await pool.query<ChatRoom>(
    'INSERT INTO chat_rooms (name, created_by) VALUES ($1, $2) RETURNING *',
    [name, createdBy],
  );
  return rows[0];
}

export async function updateRoom(id: number, params: { name?: string; archived?: boolean }): Promise<void> {
  if (params.name !== undefined) {
    await pool.query('UPDATE chat_rooms SET name = $1 WHERE id = $2', [params.name, id]);
  }
  if (params.archived !== undefined) {
    await pool.query(
      'UPDATE chat_rooms SET archived_at = $1 WHERE id = $2',
      [params.archived ? new Date() : null, id],
    );
  }
}

export async function addRoomMember(roomId: number, customerId: string): Promise<void> {
  await pool.query(
    'INSERT INTO chat_room_members (room_id, customer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [roomId, customerId],
  );
}

export async function removeRoomMember(roomId: number, customerId: string): Promise<void> {
  await pool.query(
    'DELETE FROM chat_room_members WHERE room_id = $1 AND customer_id = $2',
    [roomId, customerId],
  );
}

export async function getRoomMembers(roomId: number): Promise<Array<{ customer_id: string; name: string; email: string }>> {
  const { rows } = await pool.query(
    `SELECT m.customer_id, c.name, c.email
     FROM chat_room_members m JOIN customers c ON c.id = m.customer_id
     WHERE m.room_id = $1`,
    [roomId],
  );
  return rows;
}

export async function isRoomMember(roomId: number, customerId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM chat_room_members WHERE room_id = $1 AND customer_id = $2',
    [roomId, customerId],
  );
  return rows.length > 0;
}

export async function getRoomMessages(roomId: number, afterId?: number): Promise<ChatMessage[]> {
  if (afterId !== undefined) {
    const { rows } = await pool.query<ChatMessage>(
      'SELECT * FROM chat_messages WHERE room_id = $1 AND id > $2 ORDER BY id ASC',
      [roomId, afterId],
    );
    return rows;
  }
  const { rows } = await pool.query<ChatMessage>(
    'SELECT * FROM chat_messages WHERE room_id = $1 ORDER BY id ASC',
    [roomId],
  );
  return rows;
}

export async function addRoomMessage(params: {
  roomId: number;
  senderId: string;
  senderName: string;
  senderCustomerId?: string;
  body: string;
}): Promise<ChatMessage> {
  const { rows } = await pool.query<ChatMessage>(
    `INSERT INTO chat_messages (room_id, sender_id, sender_name, sender_customer_id, body) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [params.roomId, params.senderId, params.senderName, params.senderCustomerId ?? null, params.body],
  );
  return rows[0];
}

export async function markRoomMessagesRead(roomId: number, customerId: string, upToId: number): Promise<void> {
  await pool.query(
    `INSERT INTO chat_message_reads (message_id, customer_id)
     SELECT id, $3
     FROM chat_messages
     WHERE room_id = $1 AND id <= $2
       AND NOT EXISTS (
         SELECT 1 FROM chat_message_reads r
         WHERE r.message_id = chat_messages.id AND r.customer_id = $3
       )
     ON CONFLICT DO NOTHING`,
    [roomId, upToId, customerId],
  );
}

export async function getCustomerByEmail(email: string): Promise<{ id: string; name: string; email: string } | null> {
  const { rows } = await pool.query(
    'SELECT id, name, email FROM customers WHERE email = $1',
    [email],
  );
  return rows[0] ?? null;
}

export async function getCustomerById(id: string): Promise<{ id: string; name: string; email: string } | null> {
  const { rows } = await pool.query(
    'SELECT id, name, email FROM customers WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function ensureDirectRoomForCustomer(
  customerId: string,
  customerName: string,
  createdBy: string,
): Promise<{ room_id: number; customer_id: string }> {
  const existing = await pool.query<{ id: number }>(
    'SELECT id FROM chat_rooms WHERE direct_customer_id = $1 AND is_direct = TRUE LIMIT 1',
    [customerId],
  );
  if (existing.rows.length) return { room_id: existing.rows[0].id, customer_id: customerId };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<ChatRoom>(
      'INSERT INTO chat_rooms (name, created_by, is_direct, direct_customer_id) VALUES ($1, $2, TRUE, $3) RETURNING *',
      [`Chat mit ${customerName}`, createdBy, customerId],
    );
    const room = rows[0];
    await client.query(
      'INSERT INTO chat_room_members (room_id, customer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [room.id, customerId],
    );
    await client.query('COMMIT');
    return { room_id: room.id, customer_id: customerId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function listAllCustomers(): Promise<Array<{ id: string; name: string; email: string }>> {
  const { rows } = await pool.query(
    'SELECT id, name, email FROM customers WHERE keycloak_user_id IS NOT NULL ORDER BY name ASC'
  );
  return rows;
}

