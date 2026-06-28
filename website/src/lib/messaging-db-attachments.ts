import { pool } from './messaging-db-pool';

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
  sender_name?: string;
  sender_customer_id: string | null;
  body: string;
  created_at: Date;
}

export interface RoomInboxItem {
  id: number;
  name: string;
  lastMessageBody: string | null;
  lastMessageSenderName: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
}

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
  senderCustomerId?: string;
  body: string;
}): Promise<ChatMessage> {
  const { rows } = await pool.query<ChatMessage>(
    `INSERT INTO chat_messages (room_id, sender_id, sender_customer_id, body) VALUES ($1, $2, $3, $4) RETURNING *, COALESCE((SELECT name FROM customers WHERE id = chat_messages.sender_customer_id), 'System') AS sender_name`,
    [params.roomId, params.senderId, params.senderCustomerId ?? null, params.body],
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
