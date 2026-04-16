# Messaging Plan 2 — Direct Messages + Chat Rooms + User Portal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin can message individual users or groups; users can message admin; admin creates persistent chat rooms with assigned members. All accessible via the website with Keycloak SSO.

**Architecture:** Extend `messaging-db.ts` with thread/room CRUD. New API routes under `/api/admin/messages`, `/api/admin/rooms`, `/api/portal/messages`, `/api/portal/rooms`. Two new Svelte components (`MessagePanel.svelte`, `ChatRoomPanel.svelte`) shared by admin and portal pages. User portal routes at `/portal/*` are protected by the same `getSession`/`getLoginUrl` guards as `/admin/*`.

**Prerequisite:** Plan 1 must be complete (tables exist in DB, `messaging-db.ts` exists).

**Tech Stack:** Astro 5 SSR, Svelte 5 (runes), TypeScript, `pg` pool. Chat room polling every 4 seconds via `setInterval`.

---

## File Map

| Action | Path |
|---|---|
| Modify | `website/src/lib/messaging-db.ts` |
| Create | `website/src/pages/api/admin/messages.ts` |
| Create | `website/src/pages/api/admin/messages/[threadId].ts` |
| Create | `website/src/pages/api/admin/rooms.ts` |
| Create | `website/src/pages/api/admin/rooms/[id].ts` |
| Create | `website/src/pages/api/admin/rooms/[id]/members.ts` |
| Create | `website/src/pages/api/portal/messages.ts` |
| Create | `website/src/pages/api/portal/messages/[threadId].ts` |
| Create | `website/src/pages/api/portal/rooms.ts` |
| Create | `website/src/pages/api/portal/rooms/[id]/messages.ts` |
| Create | `website/src/components/MessagePanel.svelte` |
| Create | `website/src/components/ChatRoomPanel.svelte` |
| Create | `website/src/components/UnreadBadge.svelte` |
| Create | `website/src/pages/admin/nachrichten.astro` |
| Create | `website/src/pages/admin/raeume.astro` |
| Create | `website/src/pages/portal/index.astro` |
| Create | `website/src/pages/portal/nachrichten.astro` |
| Create | `website/src/pages/portal/raum/[id].astro` |

---

## Task 1: Extend messaging-db.ts with thread, message, room, and member functions

**Files:**
- Modify: `website/src/lib/messaging-db.ts`

- [ ] **Step 1: Append the following exports to the end of `messaging-db.ts`**

```typescript
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
  member_count?: number;
}

export interface ChatMessage {
  id: number;
  room_id: number;
  sender_id: string;
  sender_name: string;
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
  body: string;
}): Promise<Message> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<Message>(
      `INSERT INTO messages (thread_id, sender_id, sender_role, body) VALUES ($1, $2, $3, $4) RETURNING *`,
      [params.threadId, params.senderId, params.senderRole, params.body],
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
  body: string;
}): Promise<ChatMessage> {
  const { rows } = await pool.query<ChatMessage>(
    `INSERT INTO chat_messages (room_id, sender_id, sender_name, body) VALUES ($1, $2, $3, $4) RETURNING *`,
    [params.roomId, params.senderId, params.senderName, params.body],
  );
  return rows[0];
}

export async function markRoomMessagesRead(roomId: number, customerId: string, upToId: number): Promise<void> {
  // Fetch message IDs in this room up to upToId that this customer hasn't read yet
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM chat_messages
     WHERE room_id = $1 AND id <= $2
       AND id NOT IN (SELECT message_id FROM chat_message_reads WHERE customer_id = $3)`,
    [roomId, upToId, customerId],
  );
  if (!rows.length) return;
  for (const row of rows) {
    await pool.query(
      'INSERT INTO chat_message_reads (message_id, customer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [row.id, customerId],
    );
  }
}

export async function getCustomerByEmail(email: string): Promise<{ id: string; name: string; email: string } | null> {
  const { rows } = await pool.query(
    'SELECT id, name, email FROM customers WHERE email = $1',
    [email],
  );
  return rows[0] ?? null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/messaging-db.ts
git commit -m "feat(messaging-db): thread, message, room, and member CRUD functions"
```

---

## Task 2: Create admin messaging API routes

**Files:**
- Create: `website/src/pages/api/admin/messages.ts`
- Create: `website/src/pages/api/admin/messages/[threadId].ts`

- [ ] **Step 1: Create `messages.ts`**

```typescript
// website/src/pages/api/admin/messages.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listThreadsForAdmin, getOrCreateThreadForCustomer, addMessage } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const threads = await listThreadsForAdmin();
  return new Response(JSON.stringify({ threads }), { headers: { 'Content-Type': 'application/json' } });
};

// Admin starts a new thread with a customer (by customer UUID)
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { customerId, body } = await request.json() as { customerId: string; body: string };
  if (!customerId?.trim() || !body?.trim()) {
    return new Response(JSON.stringify({ error: 'customerId and body required' }), { status: 400 });
  }
  const thread = await getOrCreateThreadForCustomer(customerId);
  const msg = await addMessage({ threadId: thread.id, senderId: session.sub, senderRole: 'admin', body: body.trim() });
  return new Response(JSON.stringify({ thread, message: msg }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2: Create `messages/[threadId].ts`**

```typescript
// website/src/pages/api/admin/messages/[threadId].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getThread, getThreadMessages, addMessage, markThreadRead } from '../../../../lib/messaging-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const threadId = parseInt(params.threadId!, 10);
  if (isNaN(threadId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const [thread, messages] = await Promise.all([
    getThread(threadId),
    getThreadMessages(threadId),
  ]);
  if (!thread) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  await markThreadRead(threadId, 'admin');
  return new Response(JSON.stringify({ thread, messages }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const threadId = parseInt(params.threadId!, 10);
  if (isNaN(threadId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const { body } = await request.json() as { body: string };
  if (!body?.trim()) return new Response(JSON.stringify({ error: 'body required' }), { status: 400 });
  const msg = await addMessage({ threadId, senderId: session.sub, senderRole: 'admin', body: body.trim() });
  return new Response(JSON.stringify({ message: msg }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3: Verify and commit**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
git add website/src/pages/api/admin/messages.ts website/src/pages/api/admin/messages/
git commit -m "feat(api): admin messages API routes"
```

---

## Task 3: Create admin rooms API routes

**Files:**
- Create: `website/src/pages/api/admin/rooms.ts`
- Create: `website/src/pages/api/admin/rooms/[id].ts`
- Create: `website/src/pages/api/admin/rooms/[id]/members.ts`

- [ ] **Step 1: Create `rooms.ts`**

```typescript
// website/src/pages/api/admin/rooms.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listRoomsForAdmin, createRoom } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const rooms = await listRoomsForAdmin();
  return new Response(JSON.stringify({ rooms }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { name } = await request.json() as { name: string };
  if (!name?.trim()) return new Response(JSON.stringify({ error: 'name required' }), { status: 400 });
  const room = await createRoom(name.trim(), session.sub);
  return new Response(JSON.stringify({ room }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2: Create `rooms/[id].ts`**

```typescript
// website/src/pages/api/admin/rooms/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updateRoom, getRoomMessages, addRoomMessage, getRoomMembers } from '../../../../lib/messaging-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const url = new URL(request.url);
  const afterId = url.searchParams.get('after') ? parseInt(url.searchParams.get('after')!, 10) : undefined;
  const [messages, members] = await Promise.all([getRoomMessages(roomId, afterId), getRoomMembers(roomId)]);
  return new Response(JSON.stringify({ messages, members }), { headers: { 'Content-Type': 'application/json' } });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const { name, archived } = await request.json() as { name?: string; archived?: boolean };
  await updateRoom(roomId, { name, archived });
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const { body } = await request.json() as { body: string };
  if (!body?.trim()) return new Response(JSON.stringify({ error: 'body required' }), { status: 400 });
  const msg = await addRoomMessage({ roomId, senderId: session.sub, senderName: session.name ?? session.preferred_username, body: body.trim() });
  return new Response(JSON.stringify({ message: msg }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3: Create `rooms/[id]/members.ts`**

```typescript
// website/src/pages/api/admin/rooms/[id]/members.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { addRoomMember, removeRoomMember } from '../../../../../lib/messaging-db';

// POST { customerId, action: 'add'|'remove' }
export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const { customerId, action } = await request.json() as { customerId: string; action: 'add' | 'remove' };
  if (!customerId || !['add', 'remove'].includes(action)) {
    return new Response(JSON.stringify({ error: 'customerId and action (add|remove) required' }), { status: 400 });
  }
  if (action === 'add') await addRoomMember(roomId, customerId);
  else await removeRoomMember(roomId, customerId);
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 4: Verify and commit**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
git add website/src/pages/api/admin/rooms.ts website/src/pages/api/admin/rooms/
git commit -m "feat(api): admin rooms API routes"
```

---

## Task 4: Create portal API routes

**Files:**
- Create: `website/src/pages/api/portal/messages.ts`
- Create: `website/src/pages/api/portal/messages/[threadId].ts`
- Create: `website/src/pages/api/portal/rooms.ts`
- Create: `website/src/pages/api/portal/rooms/[id]/messages.ts`

- [ ] **Step 1: Create portal auth helper (inline pattern)**

In each portal route, authenticate the user and resolve their customer row using `getCustomerByEmail`. This pattern repeats across all portal routes:

```typescript
const session = await getSession(request.headers.get('cookie'));
if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
const customer = await getCustomerByEmail(session.email);
if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 403 });
```

- [ ] **Step 2: Create `portal/messages.ts`**

```typescript
// website/src/pages/api/portal/messages.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { getCustomerByEmail, getThreadByCustomerId, getOrCreateThreadForCustomer, addMessage, createInboxItem } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 403 });
  const thread = await getThreadByCustomerId(customer.id);
  return new Response(JSON.stringify({ thread: thread ?? null }), { headers: { 'Content-Type': 'application/json' } });
};

// User sends first message — creates thread + inbox item
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 403 });
  const { body } = await request.json() as { body: string };
  if (!body?.trim()) return new Response(JSON.stringify({ error: 'body required' }), { status: 400 });
  const thread = await getOrCreateThreadForCustomer(customer.id);
  const msg = await addMessage({ threadId: thread.id, senderId: session.sub, senderRole: 'user', body: body.trim() });
  await createInboxItem({
    type: 'user_message',
    referenceId: String(thread.id),
    referenceTable: 'message_threads',
    payload: { senderName: customer.name, senderEmail: customer.email, message: body.trim().slice(0, 120) },
  });
  return new Response(JSON.stringify({ thread, message: msg }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3: Create `portal/messages/[threadId].ts`**

```typescript
// website/src/pages/api/portal/messages/[threadId].ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getCustomerByEmail, getThread, getThreadMessages, addMessage, markThreadRead } from '../../../../lib/messaging-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 403 });
  const threadId = parseInt(params.threadId!, 10);
  if (isNaN(threadId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const thread = await getThread(threadId);
  if (!thread || thread.customer_id !== customer.id) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  const messages = await getThreadMessages(threadId);
  await markThreadRead(threadId, 'user');
  return new Response(JSON.stringify({ thread, messages }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 403 });
  const threadId = parseInt(params.threadId!, 10);
  if (isNaN(threadId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const thread = await getThread(threadId);
  if (!thread || thread.customer_id !== customer.id) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  const { body } = await request.json() as { body: string };
  if (!body?.trim()) return new Response(JSON.stringify({ error: 'body required' }), { status: 400 });
  const msg = await addMessage({ threadId, senderId: session.sub, senderRole: 'user', body: body.trim() });
  return new Response(JSON.stringify({ message: msg }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 4: Create `portal/rooms.ts`**

```typescript
// website/src/pages/api/portal/rooms.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { getCustomerByEmail, listRoomsForCustomer } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ rooms: [] }), { headers: { 'Content-Type': 'application/json' } });
  const rooms = await listRoomsForCustomer(customer.id);
  return new Response(JSON.stringify({ rooms }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 5: Create `portal/rooms/[id]/messages.ts`**

```typescript
// website/src/pages/api/portal/rooms/[id]/messages.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getCustomerByEmail, isRoomMember, getRoomMessages, addRoomMessage, markRoomMessagesRead } from '../../../../../lib/messaging-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 403 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  if (!await isRoomMember(roomId, customer.id)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  const url = new URL(request.url);
  const afterId = url.searchParams.get('after') ? parseInt(url.searchParams.get('after')!, 10) : undefined;
  const messages = await getRoomMessages(roomId, afterId);
  if (messages.length > 0) {
    await markRoomMessagesRead(roomId, customer.id, messages[messages.length - 1].id);
  }
  return new Response(JSON.stringify({ messages }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 403 });
  const roomId = parseInt(params.id!, 10);
  if (isNaN(roomId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  if (!await isRoomMember(roomId, customer.id)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  const { body } = await request.json() as { body: string };
  if (!body?.trim()) return new Response(JSON.stringify({ error: 'body required' }), { status: 400 });
  const msg = await addRoomMessage({ roomId, senderId: session.sub, senderName: customer.name, body: body.trim() });
  return new Response(JSON.stringify({ message: msg }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 6: Verify and commit**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
git add website/src/pages/api/portal/
git commit -m "feat(api): portal messages and rooms API routes"
```

---

## Task 5: Create MessagePanel.svelte

Split-panel component: thread list left, open thread right. Used by both admin and portal.

**Files:**
- Create: `website/src/components/MessagePanel.svelte`

- [ ] **Step 1: Create the file**

```svelte
<script lang="ts">
  import type { MessageThread, Message } from '../lib/messaging-db';

  const {
    threads: initialThreads,
    role,            // 'admin' | 'user'
    listUrl,         // e.g. '/api/admin/messages' or '/api/portal/messages'
    customers,       // admin only: list of { id, name, email } for "New Message"
  }: {
    threads: MessageThread[];
    role: 'admin' | 'user';
    listUrl: string;
    customers?: Array<{ id: string; name: string; email: string }>;
  } = $props();

  let threads = $state<MessageThread[]>(initialThreads);
  let activeThread = $state<MessageThread | null>(null);
  let messages = $state<Message[]>([]);
  let newBody = $state('');
  let sending = $state(false);
  let loadingThread = $state(false);
  let showNewForm = $state(false);
  let newCustomerId = $state('');
  let newBody2 = $state('');  // body for new thread form

  async function openThread(thread: MessageThread) {
    activeThread = thread;
    loadingThread = true;
    const threadUrl = `${listUrl}/${thread.id}`;
    const res = await fetch(threadUrl);
    const data = await res.json() as { messages: Message[] };
    messages = data.messages;
    loadingThread = false;
  }

  async function sendReply() {
    if (!newBody.trim() || !activeThread || sending) return;
    sending = true;
    const res = await fetch(`${listUrl}/${activeThread.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: newBody.trim() }),
    });
    if (res.ok) {
      const data = await res.json() as { message: Message };
      messages = [...messages, data.message];
      newBody = '';
    }
    sending = false;
  }

  async function startNewThread() {
    if (!newCustomerId || !newBody2.trim() || sending) return;
    sending = true;
    const res = await fetch(listUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: newCustomerId, body: newBody2.trim() }),
    });
    if (res.ok) {
      const data = await res.json() as { thread: MessageThread; message: Message };
      threads = [data.thread, ...threads];
      activeThread = data.thread;
      messages = [data.message];
      newBody2 = '';
      newCustomerId = '';
      showNewForm = false;
    }
    sending = false;
  }

  // User: start first message (no existing thread)
  async function startUserThread() {
    if (!newBody.trim() || sending) return;
    sending = true;
    const res = await fetch(listUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: newBody.trim() }),
    });
    if (res.ok) {
      const data = await res.json() as { thread: MessageThread; message: Message };
      threads = [data.thread];
      activeThread = data.thread;
      messages = [data.message];
      newBody = '';
    }
    sending = false;
  }

  function formatTime(date: Date | string): string {
    return new Date(date).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  const hasThread = $derived(threads.length > 0);
</script>

<div class="panel">
  <!-- Thread list -->
  <aside class="thread-list">
    <div class="list-header">
      <span>Nachrichten</span>
      {#if role === 'admin'}
        <button class="btn-new" onclick={() => showNewForm = !showNewForm}>+ Neu</button>
      {/if}
    </div>

    {#if showNewForm && role === 'admin' && customers}
      <div class="new-form">
        <select bind:value={newCustomerId}>
          <option value="">Kunde wählen…</option>
          {#each customers as c}
            <option value={c.id}>{c.name} ({c.email})</option>
          {/each}
        </select>
        <textarea bind:value={newBody2} placeholder="Nachricht…" rows="3"></textarea>
        <div class="form-actions">
          <button onclick={() => { showNewForm = false; }}>Abbrechen</button>
          <button class="btn-send" disabled={!newCustomerId || !newBody2.trim() || sending} onclick={startNewThread}>
            {sending ? '…' : 'Senden'}
          </button>
        </div>
      </div>
    {/if}

    {#if !hasThread && role === 'user'}
      <p class="empty-hint">Noch keine Nachrichten.</p>
    {:else}
      {#each threads as t (t.id)}
        <button
          class="thread-item {activeThread?.id === t.id ? 'active' : ''}"
          onclick={() => openThread(t)}
        >
          <span class="t-name">{t.customer_name ?? 'Admin'}</span>
          {#if (t.unread_count ?? 0) > 0}
            <span class="unread-dot"></span>
          {/if}
        </button>
      {/each}
    {/if}
  </aside>

  <!-- Thread view -->
  <main class="thread-view">
    {#if !activeThread}
      {#if !hasThread && role === 'user'}
        <div class="compose">
          <p class="hint">Schreiben Sie eine Nachricht an den Admin.</p>
          <textarea bind:value={newBody} placeholder="Ihre Nachricht…" rows="4"></textarea>
          <button class="btn-send" disabled={!newBody.trim() || sending} onclick={startUserThread}>
            {sending ? '…' : 'Senden'}
          </button>
        </div>
      {:else}
        <p class="hint">Konversation auswählen.</p>
      {/if}
    {:else if loadingThread}
      <p class="hint">Lädt…</p>
    {:else}
      <div class="msg-list">
        {#each messages as msg (msg.id)}
          <div class="msg {msg.sender_role === 'admin' ? 'msg-admin' : 'msg-user'}">
            <span class="msg-meta">{msg.sender_role === 'admin' ? 'Admin' : (activeThread.customer_name ?? 'Du')} · {formatTime(msg.created_at)}</span>
            <p class="msg-body">{msg.body}</p>
          </div>
        {/each}
      </div>
      <div class="reply-bar">
        <textarea bind:value={newBody} placeholder="Antwort schreiben…" rows="2"
          onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}></textarea>
        <button class="btn-send" disabled={!newBody.trim() || sending} onclick={sendReply}>
          {sending ? '…' : '↑'}
        </button>
      </div>
    {/if}
  </main>
</div>

<style>
  .panel { display: flex; height: 100%; border: 1px solid #2a2a3e; border-radius: 8px; overflow: hidden; }
  .thread-list { width: 240px; border-right: 1px solid #2a2a3e; display: flex; flex-direction: column; background: #16162a; }
  .list-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #2a2a3e; font-size: 13px; font-weight: 600; }
  .btn-new { background: #7c6ff7; color: #fff; border: none; border-radius: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
  .thread-item { width: 100%; background: transparent; border: none; text-align: left; padding: 10px 14px; cursor: pointer; color: #ccc; font-size: 13px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e1e2e; }
  .thread-item.active { background: #2a2a3e; color: #fff; }
  .thread-item:hover:not(.active) { background: #1e1e2e; }
  .unread-dot { width: 8px; height: 8px; border-radius: 50%; background: #7c6ff7; flex-shrink: 0; }
  .empty-hint, .hint { color: #555; font-size: 13px; padding: 16px; }
  .thread-view { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .msg-list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .msg { max-width: 75%; padding: 8px 12px; border-radius: 8px; }
  .msg-admin { background: #2a2a3e; align-self: flex-start; }
  .msg-user { background: #1e3a5f; align-self: flex-end; }
  .msg-meta { font-size: 10px; color: #666; display: block; margin-bottom: 4px; }
  .msg-body { margin: 0; font-size: 13px; white-space: pre-wrap; }
  .reply-bar { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #2a2a3e; }
  .reply-bar textarea { flex: 1; background: #1e1e2e; color: #e8e8f0; border: 1px solid #374151; border-radius: 6px; padding: 8px; font-size: 13px; resize: none; }
  .btn-send { background: #7c6ff7; color: #fff; border: none; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-weight: 600; align-self: flex-end; }
  .btn-send:disabled { opacity: .5; cursor: not-allowed; }
  .compose { padding: 24px; display: flex; flex-direction: column; gap: 12px; }
  .compose textarea { background: #1e1e2e; color: #e8e8f0; border: 1px solid #374151; border-radius: 6px; padding: 10px; font-size: 13px; resize: vertical; }
  .new-form { padding: 12px; border-bottom: 1px solid #2a2a3e; display: flex; flex-direction: column; gap: 8px; }
  .new-form select, .new-form textarea { background: #1e1e2e; color: #e8e8f0; border: 1px solid #374151; border-radius: 4px; padding: 6px; font-size: 12px; width: 100%; box-sizing: border-box; }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .form-actions button { background: #374151; color: #ccc; border: none; border-radius: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
</style>
```

- [ ] **Step 2: Verify and commit**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
git add website/src/components/MessagePanel.svelte
git commit -m "feat(ui): MessagePanel Svelte component"
```

---

## Task 6: Create ChatRoomPanel.svelte

**Files:**
- Create: `website/src/components/ChatRoomPanel.svelte`

- [ ] **Step 1: Create the file**

```svelte
<script lang="ts">
  import type { ChatRoom, ChatMessage } from '../lib/messaging-db';

  const {
    rooms: initialRooms,
    role,             // 'admin' | 'user'
    messagesBaseUrl,  // '/api/admin/rooms' or '/api/portal/rooms'
  }: {
    rooms: ChatRoom[];
    role: 'admin' | 'user';
    messagesBaseUrl: string;
  } = $props();

  let rooms = $state<ChatRoom[]>(initialRooms);
  let activeRoom = $state<ChatRoom | null>(null);
  let messages = $state<ChatMessage[]>([]);
  let newBody = $state('');
  let sending = $state(false);
  let lastId = $state(0);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Admin: new room form
  let showNewRoom = $state(false);
  let newRoomName = $state('');

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!activeRoom) return;
      const url = `${messagesBaseUrl}/${activeRoom.id}/messages?after=${lastId}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json() as { messages: ChatMessage[] };
      if (data.messages.length > 0) {
        messages = [...messages, ...data.messages];
        lastId = data.messages[data.messages.length - 1].id;
      }
    }, 4000);
  }

  async function openRoom(room: ChatRoom) {
    if (pollInterval) clearInterval(pollInterval);
    activeRoom = room;
    const res = await fetch(`${messagesBaseUrl}/${room.id}/messages`);
    const data = await res.json() as { messages: ChatMessage[] };
    messages = data.messages;
    lastId = messages.length ? messages[messages.length - 1].id : 0;
    startPolling();
  }

  async function sendMessage() {
    if (!newBody.trim() || !activeRoom || sending) return;
    sending = true;
    const res = await fetch(`${messagesBaseUrl}/${activeRoom.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: newBody.trim() }),
    });
    if (res.ok) {
      const data = await res.json() as { message: ChatMessage };
      messages = [...messages, data.message];
      lastId = data.message.id;
      newBody = '';
    }
    sending = false;
  }

  async function createRoom() {
    if (!newRoomName.trim()) return;
    const res = await fetch('/api/admin/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newRoomName.trim() }),
    });
    if (res.ok) {
      const data = await res.json() as { room: ChatRoom };
      rooms = [data.room, ...rooms];
      showNewRoom = false;
      newRoomName = '';
    }
  }

  function formatTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  $effect(() => {
    return () => { if (pollInterval) clearInterval(pollInterval); };
  });
</script>

<div class="panel">
  <aside class="room-list">
    <div class="list-header">
      <span>Räume</span>
      {#if role === 'admin'}
        <button class="btn-new" onclick={() => showNewRoom = !showNewRoom}>+ Neu</button>
      {/if}
    </div>

    {#if showNewRoom && role === 'admin'}
      <div class="new-form">
        <input bind:value={newRoomName} placeholder="Raumname…" />
        <div class="form-actions">
          <button onclick={() => { showNewRoom = false; }}>Abbrechen</button>
          <button class="btn-send" disabled={!newRoomName.trim()} onclick={createRoom}>Erstellen</button>
        </div>
      </div>
    {/if}

    {#if rooms.length === 0}
      <p class="empty">Keine Räume.</p>
    {:else}
      {#each rooms as room (room.id)}
        <button class="room-item {activeRoom?.id === room.id ? 'active' : ''}" onclick={() => openRoom(room)}>
          🏠 {room.name}
        </button>
      {/each}
    {/if}
  </aside>

  <main class="chat-view">
    {#if !activeRoom}
      <p class="hint">Raum auswählen.</p>
    {:else}
      <div class="chat-header">{activeRoom.name}</div>
      <div class="msg-list">
        {#each messages as msg (msg.id)}
          <div class="msg">
            <span class="msg-meta">{msg.sender_name} · {formatTime(msg.created_at)}</span>
            <p class="msg-body">{msg.body}</p>
          </div>
        {/each}
      </div>
      <div class="reply-bar">
        <textarea bind:value={newBody} placeholder="Nachricht…" rows="2"
          onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}></textarea>
        <button class="btn-send" disabled={!newBody.trim() || sending} onclick={sendMessage}>
          {sending ? '…' : '↑'}
        </button>
      </div>
    {/if}
  </main>
</div>

<style>
  .panel { display: flex; height: 100%; border: 1px solid #2a2a3e; border-radius: 8px; overflow: hidden; }
  .room-list { width: 200px; border-right: 1px solid #2a2a3e; background: #16162a; display: flex; flex-direction: column; }
  .list-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #2a2a3e; font-size: 13px; font-weight: 600; }
  .btn-new { background: #60a5fa; color: #000; border: none; border-radius: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
  .room-item { width: 100%; background: transparent; border: none; text-align: left; padding: 10px 14px; cursor: pointer; color: #ccc; font-size: 13px; border-bottom: 1px solid #1e1e2e; }
  .room-item.active { background: #2a2a3e; color: #fff; }
  .room-item:hover:not(.active) { background: #1e1e2e; }
  .empty, .hint { color: #555; font-size: 13px; padding: 16px; }
  .chat-view { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .chat-header { padding: 12px 16px; border-bottom: 1px solid #2a2a3e; font-weight: 600; font-size: 14px; }
  .msg-list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  .msg { background: #1e1e2e; border-radius: 6px; padding: 8px 12px; }
  .msg-meta { font-size: 10px; color: #666; display: block; margin-bottom: 4px; }
  .msg-body { margin: 0; font-size: 13px; white-space: pre-wrap; }
  .reply-bar { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #2a2a3e; }
  .reply-bar textarea { flex: 1; background: #1e1e2e; color: #e8e8f0; border: 1px solid #374151; border-radius: 6px; padding: 8px; font-size: 13px; resize: none; }
  .btn-send { background: #60a5fa; color: #000; border: none; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-weight: 600; align-self: flex-end; }
  .btn-send:disabled { opacity: .5; cursor: not-allowed; }
  .new-form { padding: 10px; border-bottom: 1px solid #2a2a3e; display: flex; flex-direction: column; gap: 6px; }
  .new-form input { background: #1e1e2e; color: #e8e8f0; border: 1px solid #374151; border-radius: 4px; padding: 6px; font-size: 12px; }
  .form-actions { display: flex; justify-content: flex-end; gap: 6px; }
  .form-actions button { background: #374151; color: #ccc; border: none; border-radius: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
</style>
```

- [ ] **Step 2: Verify and commit**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
git add website/src/components/ChatRoomPanel.svelte
git commit -m "feat(ui): ChatRoomPanel Svelte component with 4s polling"
```

---

## Task 7: Create admin pages (nachrichten + raeume)

**Files:**
- Create: `website/src/pages/admin/nachrichten.astro`
- Create: `website/src/pages/admin/raeume.astro`

- [ ] **Step 1: Add `listAllCustomers` to messaging-db.ts first**

Append to `website/src/lib/messaging-db.ts`:
```typescript
export async function listAllCustomers(): Promise<Array<{ id: string; name: string; email: string }>> {
  const { rows } = await pool.query('SELECT id, name, email FROM customers ORDER BY name ASC');
  return rows;
}
```

- [ ] **Step 2: Create `nachrichten.astro`**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import MessagePanel from '../../components/MessagePanel.svelte';
import { getSession, isAdmin, getLoginUrl } from '../../lib/auth';
import { listThreadsForAdmin, listAllCustomers } from '../../lib/messaging-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const [threads, customers] = await Promise.all([
  listThreadsForAdmin(),
  listAllCustomers(),
]);
---

<AdminLayout title="Nachrichten">
  <div style="height: calc(100vh - 120px)">
    <MessagePanel
      threads={threads}
      role="admin"
      listUrl="/api/admin/messages"
      {customers}
      client:load
    />
  </div>
</AdminLayout>
```

- [ ] **Step 2: Create `raeume.astro`**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import ChatRoomPanel from '../../components/ChatRoomPanel.svelte';
import { getSession, isAdmin, getLoginUrl } from '../../lib/auth';
import { listRoomsForAdmin } from '../../lib/messaging-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const rooms = await listRoomsForAdmin();
---

<AdminLayout title="Räume">
  <div style="height: calc(100vh - 120px)">
    <ChatRoomPanel rooms={rooms} role="admin" messagesBaseUrl="/api/admin/rooms" client:load />
  </div>
</AdminLayout>
```

- [ ] **Step 3: Verify and commit**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
git add website/src/pages/admin/nachrichten.astro website/src/pages/admin/raeume.astro
git commit -m "feat(admin): Nachrichten and Räume admin pages"
```

---

## Task 8: Create user portal pages

**Files:**
- Create: `website/src/pages/portal/index.astro`
- Create: `website/src/pages/portal/nachrichten.astro`
- Create: `website/src/pages/portal/raum/[id].astro`

- [ ] **Step 1: Create `portal/index.astro`**

```astro
---
import Layout from '../../layouts/Layout.astro';
import { getSession, getLoginUrl } from '../../lib/auth';
import { getCustomerByEmail, getThreadByCustomerId, listRoomsForCustomer } from '../../lib/messaging-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl('/portal'));

const customer = await getCustomerByEmail(session.email);
const thread = customer ? await getThreadByCustomerId(customer.id) : null;
const rooms = customer ? await listRoomsForCustomer(customer.id) : [];
---

<Layout title="Mein Portal">
  <main style="max-width:600px;margin:48px auto;padding:0 16px">
    <h1>Willkommen, {session.given_name ?? session.name}</h1>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:24px">
      <a href="/portal/nachrichten" style="display:flex;justify-content:space-between;align-items:center;background:#1e1e2e;border-radius:8px;padding:16px 20px;text-decoration:none;color:#e8e8f0">
        <span>💬 Nachrichten</span>
        <span style="color:#666;font-size:13px">{thread ? 'Konversation ansehen' : 'Neue Nachricht'} →</span>
      </a>
      {#each rooms as room}
        <a href={`/portal/raum/${room.id}`} style="display:flex;justify-content:space-between;align-items:center;background:#1e1e2e;border-radius:8px;padding:16px 20px;text-decoration:none;color:#e8e8f0">
          <span>🏠 {room.name}</span>
          <span style="color:#666;font-size:13px">Öffnen →</span>
        </a>
      {/each}
    </div>
  </main>
</Layout>
```

- [ ] **Step 2: Create `portal/nachrichten.astro`**

```astro
---
import Layout from '../../layouts/Layout.astro';
import MessagePanel from '../../components/MessagePanel.svelte';
import { getSession, getLoginUrl } from '../../lib/auth';
import { getCustomerByEmail, getThreadByCustomerId, getThreadMessages } from '../../lib/messaging-db';
import type { MessageThread } from '../../lib/messaging-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl('/portal/nachrichten'));

const customer = await getCustomerByEmail(session.email);
if (!customer) return Astro.redirect('/portal');

const thread = await getThreadByCustomerId(customer.id);
const threads: MessageThread[] = thread ? [thread] : [];
---

<Layout title="Nachrichten">
  <div style="max-width:900px;margin:48px auto;padding:0 16px;height:calc(100vh - 120px)">
    <h2 style="margin-bottom:16px">Nachrichten</h2>
    <div style="height:calc(100% - 50px)">
      <MessagePanel {threads} role="user" listUrl="/api/portal/messages" client:load />
    </div>
  </div>
</Layout>
```

- [ ] **Step 3: Create `portal/raum/[id].astro`**

```astro
---
import Layout from '../../../layouts/Layout.astro';
import ChatRoomPanel from '../../../components/ChatRoomPanel.svelte';
import { getSession, getLoginUrl } from '../../../lib/auth';
import { getCustomerByEmail, listRoomsForCustomer } from '../../../lib/messaging-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());

const customer = await getCustomerByEmail(session.email);
if (!customer) return Astro.redirect('/portal');

const rooms = await listRoomsForCustomer(customer.id);
const roomId = parseInt(Astro.params.id!, 10);
const room = rooms.find(r => r.id === roomId);
if (!room) return Astro.redirect('/portal');
---

<Layout title={room.name}>
  <div style="max-width:1000px;margin:48px auto;padding:0 16px;height:calc(100vh - 120px)">
    <h2 style="margin-bottom:16px">{room.name}</h2>
    <div style="height:calc(100% - 50px)">
      <ChatRoomPanel rooms={[room]} role="user" messagesBaseUrl="/api/portal/rooms" client:load />
    </div>
  </div>
</Layout>
```

- [ ] **Step 4: Verify and commit**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
git add website/src/pages/portal/
git commit -m "feat(portal): user portal pages (index, nachrichten, raum/[id])"
```

---

## Validation

- [ ] Log in as admin → visit `/admin/nachrichten` — thread list shows, "Neu" button works
- [ ] Admin creates a room at `/admin/raeume`, adds a customer as member
- [ ] Log in as the customer (Keycloak) → visit `/portal` → see room listed
- [ ] Open the room → send a message → appears in admin view after ≤4s
- [ ] Customer visits `/portal/nachrichten` → compose first message → appears in admin inbox as `user_message`
- [ ] Admin replies in `/admin/nachrichten` → customer sees reply
