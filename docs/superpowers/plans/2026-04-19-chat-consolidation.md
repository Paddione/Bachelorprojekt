# Chat-Konsolidierung: Direktnachrichten → Chat-Räume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 1-to-1 direct message system (message_threads/messages) into the chat-rooms system, extend ChatWidget to show all rooms with an inline message panel, and remove all obsolete files.

**Architecture:** Each customer gets one `is_direct=true` chat room auto-created on first widget open via `POST /api/portal/rooms/ensure-direct`. The ChatWidget becomes a two-panel popup (room list + messages) using the existing `/api/portal/rooms/[id]/messages` API. All direct message tables, API routes, pages, and components are removed.

**Tech Stack:** Astro 5, Svelte 5 (runes), PostgreSQL, TypeScript, Kubernetes/Kustomize

---

## File Map

**Modified:**
- `k3d/website-schema.yaml` — add `is_direct`, `direct_customer_id` columns to `chat_rooms`
- `website/src/lib/messaging-db.ts` — update types + add `ensureDirectRoom` + remove all thread functions/types
- `website/src/pages/api/portal/rooms.ts` — switch to `listRoomsWithInboxData`
- `website/src/components/ChatWidget.svelte` — full rewrite as two-panel popup
- `website/src/layouts/AdminLayout.astro` — remove Nachrichten nav link
- `website/src/layouts/PortalLayout.astro` — remove Nachrichten nav item + `unreadMessages` prop
- `website/src/pages/portal/index.astro` — remove thread link, clean up
- `website/src/pages/api/cron/notify-unread.ts` — remove direct-message query

**Created:**
- `website/src/pages/api/portal/rooms/ensure-direct.ts`

**Deleted:**
- `website/src/components/MessagePanel.svelte`
- `website/src/components/portal/NachrichtenSection.astro`
- `website/src/pages/portal/nachrichten.astro`
- `website/src/pages/admin/nachrichten.astro`
- `website/src/pages/api/portal/messages.ts`
- `website/src/pages/api/portal/messages/[threadId].ts`
- `website/src/pages/api/portal/nachrichten.ts`
- `website/src/pages/api/admin/messages.ts`
- `website/src/pages/api/admin/messages/[threadId].ts`

---

### Task 1: DB Schema — add is_direct columns to chat_rooms

**Files:**
- Modify: `k3d/website-schema.yaml`

- [ ] **Step 1: Add two columns to the chat_rooms CREATE TABLE statement**

In `k3d/website-schema.yaml`, find the `chat_rooms` table definition (around line 155) and replace it:

```sql
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id               SERIAL PRIMARY KEY,
        name             TEXT NOT NULL,
        created_by       TEXT NOT NULL,
        created_at       TIMESTAMPTZ DEFAULT now(),
        archived_at      TIMESTAMPTZ,
        is_direct        BOOLEAN NOT NULL DEFAULT false,
        direct_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL
      );
```

- [ ] **Step 2: Verify the YAML is valid**

```bash
python3 -c "import yaml; yaml.safe_load(open('k3d/website-schema.yaml'))" && echo OK
```

Expected: `OK`

- [ ] **Step 3: Apply schema to running dev cluster (if active)**

```bash
kubectl exec -n workspace deploy/shared-db -- psql -U website -d website -c "
  ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS is_direct BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS direct_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
"
```

Expected: `ALTER TABLE`

- [ ] **Step 4: Commit**

```bash
git add k3d/website-schema.yaml
git commit -m "feat(schema): add is_direct + direct_customer_id to chat_rooms"
```

---

### Task 2: messaging-db.ts — update types, add ensureDirectRoom, remove thread code

**Files:**
- Modify: `website/src/lib/messaging-db.ts`

- [ ] **Step 1: Update ChatRoom type to include new columns**

Find the `ChatRoom` interface and replace it:

```typescript
export interface ChatRoom {
  id: number;
  name: string;
  created_by: string;
  created_at: Date;
  archived_at: Date | null;
  member_count?: number;
  is_direct: boolean;
  direct_customer_id: string | null;
}
```

- [ ] **Step 2: Update RoomInboxItem type to include is_direct**

Find `RoomInboxItem` and replace it:

```typescript
export interface RoomInboxItem {
  id: number;
  name: string;
  is_direct: boolean;
  direct_customer_id: string | null;
  lastMessageBody: string | null;
  lastMessageSenderName: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
}
```

- [ ] **Step 3: Update listRoomsWithInboxData to return is_direct and direct_customer_id**

Find `listRoomsWithInboxData` and replace the entire function:

```typescript
export async function listRoomsWithInboxData(customerId: string): Promise<RoomInboxItem[]> {
  const { rows } = await pool.query<RoomInboxItem>(
    `SELECT
       r.id,
       r.name,
       r.is_direct        AS "is_direct",
       r.direct_customer_id::text AS "direct_customer_id",
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
         AND (cm.sender_customer_id IS NULL OR cm.sender_customer_id::text <> $1)
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_reads cr
           WHERE cr.message_id = cm.id AND cr.customer_id::text = $1
         )
     ) unread ON true
     WHERE r.archived_at IS NULL
     ORDER BY r.is_direct DESC, COALESCE(lm.created_at, r.created_at) DESC`,
    [customerId],
  );
  return rows;
}
```

- [ ] **Step 4: Update listRoomsForAdmin to include is_direct**

Find `listRoomsForAdmin` and replace it:

```typescript
export async function listRoomsForAdmin(): Promise<ChatRoom[]> {
  const { rows } = await pool.query<ChatRoom>(
    `SELECT r.*, r.is_direct, r.direct_customer_id::text AS direct_customer_id,
            count(m.customer_id) AS member_count
     FROM chat_rooms r
     LEFT JOIN chat_room_members m ON m.room_id = r.id
     GROUP BY r.id
     ORDER BY r.is_direct DESC, r.created_at DESC`,
  );
  return rows;
}
```

- [ ] **Step 5: Update listRoomsForCustomer to include is_direct**

Find `listRoomsForCustomer` and replace it:

```typescript
export async function listRoomsForCustomer(customerId: string): Promise<ChatRoom[]> {
  const { rows } = await pool.query<ChatRoom>(
    `SELECT r.*, r.is_direct, r.direct_customer_id::text AS direct_customer_id
     FROM chat_rooms r
     JOIN chat_room_members m ON m.room_id = r.id
     WHERE m.customer_id = $1 AND r.archived_at IS NULL
     ORDER BY r.is_direct DESC, r.created_at DESC`,
    [customerId],
  );
  return rows;
}
```

- [ ] **Step 6: Add ensureDirectRoom function (after createRoom)**

Insert this new function after `createRoom`:

```typescript
export async function ensureDirectRoom(customerId: string, createdBy: string): Promise<{ id: number }> {
  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM chat_rooms WHERE is_direct = true AND direct_customer_id = $1 LIMIT 1`,
    [customerId],
  );
  if (existing.rows.length) return existing.rows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO chat_rooms (name, created_by, is_direct, direct_customer_id)
       VALUES ('Chat mit Admin', $1, true, $2) RETURNING id`,
      [createdBy, customerId],
    );
    const roomId = rows[0].id;
    await client.query(
      `INSERT INTO chat_room_members (room_id, customer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [roomId, customerId],
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
```

- [ ] **Step 7: Remove all thread types and functions**

Delete the following from `messaging-db.ts`:
- The `// ── Thread types ──` block and `MessageThread` + `Message` interfaces
- The `// ── Thread functions ──` block with all functions:
  - `listThreadsForAdmin`
  - `getOrCreateThreadForCustomer`
  - `getThread`
  - `getThreadMessages`
  - `addMessage`
  - `markThreadRead`
  - `getThreadByCustomerId`

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors only from files that still import removed types (those will be fixed in later tasks). No errors within messaging-db.ts itself.

- [ ] **Step 9: Commit**

```bash
git add website/src/lib/messaging-db.ts
git commit -m "feat(messaging-db): add ensureDirectRoom, update types for is_direct, remove thread functions"
```

---

### Task 3: New API — POST /api/portal/rooms/ensure-direct

**Files:**
- Create: `website/src/pages/api/portal/rooms/ensure-direct.ts`

- [ ] **Step 1: Create the file**

```typescript
// website/src/pages/api/portal/rooms/ensure-direct.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getCustomerByEmail, ensureDirectRoom } from '../../../../lib/messaging-db';
import { upsertCustomer } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await upsertCustomer({ name: session.name, email: session.email, keycloakUserId: session.sub });
  const room = await ensureDirectRoom(customer.id, session.sub);
  return new Response(
    JSON.stringify({ room_id: room.id, customer_id: customer.id }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "ensure-direct"
```

Expected: no output (no errors for this file)

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/portal/rooms/ensure-direct.ts
git commit -m "feat(api): add POST /api/portal/rooms/ensure-direct"
```

---

### Task 4: Update GET /api/portal/rooms to return RoomInboxItem[]

**Files:**
- Modify: `website/src/pages/api/portal/rooms.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
// website/src/pages/api/portal/rooms.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { getCustomerByEmail, listRoomsWithInboxData } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ rooms: [] }), { headers: { 'Content-Type': 'application/json' } });
  const rooms = await listRoomsWithInboxData(customer.id);
  return new Response(JSON.stringify({ rooms }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/api/portal/rooms.ts
git commit -m "feat(api): portal/rooms returns RoomInboxItem[] with unread counts"
```

---

### Task 5: Rewrite ChatWidget.svelte

**Files:**
- Modify: `website/src/components/ChatWidget.svelte`

- [ ] **Step 1: Replace the entire file with the new two-panel widget**

```svelte
<script lang="ts">
  import type { RoomInboxItem, ChatMessage } from '../lib/messaging-db';

  type AuthResponse = { authenticated: false } | { authenticated: true; user: { name: string; isAdmin: boolean } };

  let open = $state(false);
  let visible = $state(false);
  let rooms = $state<RoomInboxItem[]>([]);
  let activeRoomId = $state<number | null>(null);
  let messages = $state<ChatMessage[]>([]);
  let newBody = $state('');
  let sending = $state(false);
  let loading = $state(true);
  let lastId = $state(0);
  let customerId = $state('');
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let msgContainer = $state<HTMLDivElement | null>(null);

  let totalUnread = $derived(rooms.reduce((sum, r) => sum + r.unreadCount, 0));
  let activeRoom = $derived(rooms.find(r => r.id === activeRoomId) ?? null);

  $effect(() => {
    initWidget();
    return () => { if (pollInterval) clearInterval(pollInterval); };
  });

  async function initWidget() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json() as AuthResponse;
      if (!data.authenticated || data.user.isAdmin) return;
      visible = true;
      const dr = await fetch('/api/portal/rooms/ensure-direct', { method: 'POST' });
      if (!dr.ok) return;
      const { room_id, customer_id } = await dr.json() as { room_id: number; customer_id: string };
      customerId = customer_id;
      await loadRooms();
      activeRoomId = room_id;
      await loadMessages();
    } finally {
      loading = false;
    }
  }

  async function loadRooms() {
    const res = await fetch('/api/portal/rooms');
    if (!res.ok) return;
    const data = await res.json() as { rooms: RoomInboxItem[] };
    rooms = data.rooms;
  }

  async function loadMessages() {
    if (!activeRoomId) return;
    const res = await fetch(`/api/portal/rooms/${activeRoomId}/messages`);
    if (!res.ok) return;
    const data = await res.json() as { messages: ChatMessage[] };
    messages = data.messages;
    lastId = messages.length ? messages[messages.length - 1].id : 0;
    scrollToBottom();
  }

  async function selectRoom(roomId: number) {
    if (pollInterval) clearInterval(pollInterval);
    activeRoomId = roomId;
    messages = [];
    lastId = 0;
    await loadMessages();
    startPolling();
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!open || !activeRoomId) return;
      const res = await fetch(`/api/portal/rooms/${activeRoomId}/messages?after=${lastId}`);
      if (!res.ok) return;
      const data = await res.json() as { messages: ChatMessage[] };
      if (data.messages.length > 0) {
        messages = [...messages, ...data.messages];
        lastId = data.messages[data.messages.length - 1].id;
        scrollToBottom();
      }
      await loadRooms();
    }, 5000);
  }

  async function toggleOpen() {
    open = !open;
    if (open) {
      if (activeRoomId) await loadMessages();
      startPolling();
      scrollToBottom();
    } else {
      if (pollInterval) clearInterval(pollInterval);
    }
  }

  async function sendMessage() {
    if (!newBody.trim() || !activeRoomId || sending) return;
    sending = true;
    const body = newBody.trim();
    newBody = '';
    try {
      const res = await fetch(`/api/portal/rooms/${activeRoomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const data = await res.json() as { message: ChatMessage };
        messages = [...messages, data.message];
        lastId = data.message.id;
        scrollToBottom();
      }
    } finally {
      sending = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
    }, 50);
  }

  function formatTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
</script>

{#if visible}
  <div class="chat-widget">
    {#if open}
      <div class="chat-panel">
        <div class="chat-header">
          <span>💬 {activeRoom?.name ?? 'Nachrichten'}</span>
          <button class="close-btn" onclick={toggleOpen} aria-label="Schließen">✕</button>
        </div>
        <div class="chat-body">
          <aside class="room-list">
            {#each rooms as room (room.id)}
              <button
                class="room-item {activeRoomId === room.id ? 'active' : ''}"
                onclick={() => selectRoom(room.id)}
              >
                <span class="room-name">{room.name}</span>
                {#if room.unreadCount > 0}
                  <span class="unread-badge">{room.unreadCount > 9 ? '9+' : room.unreadCount}</span>
                {/if}
              </button>
            {/each}
          </aside>
          <div class="msg-view">
            <div class="msg-list" bind:this={msgContainer}>
              {#if loading}
                <p class="hint">Lade…</p>
              {:else if messages.length === 0}
                <p class="hint">Noch keine Nachrichten.</p>
              {:else}
                {#each messages as msg (msg.id)}
                  {@const own = msg.sender_customer_id === customerId}
                  <div class="msg-row {own ? 'own' : 'other'}">
                    {#if !own}
                      <span class="sender-name">{msg.sender_name}</span>
                    {/if}
                    <div class="bubble">
                      <span class="msg-text">{msg.body}</span>
                      <span class="msg-time">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
            <div class="input-bar">
              <textarea
                bind:value={newBody}
                onkeydown={handleKeydown}
                placeholder="Nachricht… (Enter zum Senden)"
                rows="2"
                disabled={sending || !activeRoomId}
              ></textarea>
              <button class="send-btn" onclick={sendMessage} disabled={!newBody.trim() || sending || !activeRoomId}>
                {sending ? '…' : '➤'}
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
    <button class="toggle-btn" onclick={toggleOpen} aria-label="Chat öffnen/schließen">
      {#if totalUnread > 0 && !open}
        <span class="badge">{totalUnread > 9 ? '9+' : totalUnread}</span>
      {/if}
      {open ? '✕' : '💬'}
    </button>
  </div>
{/if}

<style>
  .chat-widget {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9000;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
  }
  .chat-panel {
    width: 560px;
    height: 440px;
    background: #1a2235;
    border: 1px solid #243049;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,.5);
    overflow: hidden;
  }
  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: #243049;
    font-size: 14px;
    font-weight: 600;
    color: #e8e8f0;
    flex-shrink: 0;
  }
  .close-btn {
    background: transparent;
    border: none;
    color: #aabbcc;
    cursor: pointer;
    font-size: 14px;
    padding: 0;
    line-height: 1;
  }
  .chat-body {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .room-list {
    width: 160px;
    flex-shrink: 0;
    border-right: 1px solid #243049;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .room-item {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 1px solid #1e2a3a;
    text-align: left;
    padding: 10px 12px;
    cursor: pointer;
    color: #aabbcc;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }
  .room-item.active { background: #243049; color: #e8e8f0; }
  .room-item:hover:not(.active) { background: #1e2a3a; }
  .room-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .unread-badge {
    flex-shrink: 0;
    background: #3b82f6;
    color: #fff;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 5px;
    font-family: monospace;
  }
  .msg-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .msg-list {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .hint { font-size: 12px; color: #8899aa; text-align: center; margin: auto 0; }
  .msg-row { display: flex; flex-direction: column; gap: 2px; max-width: 88%; }
  .msg-row.own { align-self: flex-end; }
  .msg-row.other { align-self: flex-start; }
  .sender-name { font-size: 10px; color: #5566aa; padding: 0 4px; }
  .bubble { display: flex; flex-direction: column; gap: 2px; }
  .msg-text {
    padding: 7px 11px;
    border-radius: 12px;
    font-size: 13px;
    color: #e8e8f0;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
  }
  .msg-row.own .msg-text { background: #e8c870; color: #0f1623; border-bottom-right-radius: 4px; }
  .msg-row.other .msg-text { background: #243049; border-bottom-left-radius: 4px; }
  .msg-time { font-size: 10px; color: #5566aa; padding: 0 4px; }
  .msg-row.own .msg-time { align-self: flex-end; }
  .input-bar {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid #243049;
    align-items: flex-end;
    flex-shrink: 0;
  }
  .input-bar textarea {
    flex: 1;
    background: #0f1623;
    color: #e8e8f0;
    border: 1px solid #374151;
    border-radius: 8px;
    padding: 7px;
    font-size: 13px;
    resize: none;
    box-sizing: border-box;
    font-family: inherit;
    line-height: 1.4;
  }
  .input-bar textarea:focus { outline: none; border-color: #e8c870; }
  .send-btn {
    background: #e8c870;
    color: #0f1623;
    border: none;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 16px;
    cursor: pointer;
    font-weight: 700;
    flex-shrink: 0;
    align-self: flex-end;
  }
  .send-btn:disabled { opacity: .5; cursor: not-allowed; }
  .toggle-btn {
    position: relative;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #e8c870;
    color: #0f1623;
    border: none;
    font-size: 22px;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,.4);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform .15s, box-shadow .15s;
  }
  .toggle-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,0,0,.5); }
  .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #ef4444;
    color: #fff;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 5px;
    font-family: monospace;
    min-width: 18px;
    text-align: center;
    line-height: 1.4;
    pointer-events: none;
  }
</style>
```

- [ ] **Step 2: Verify TypeScript compiles for ChatWidget**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "ChatWidget"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add website/src/components/ChatWidget.svelte
git commit -m "feat(widget): expand ChatWidget to full two-panel room list + message popup"
```

---

### Task 6: Remove obsolete API routes

**Files:**
- Delete: `website/src/pages/api/portal/messages.ts`
- Delete: `website/src/pages/api/portal/messages/[threadId].ts`
- Delete: `website/src/pages/api/portal/nachrichten.ts`
- Delete: `website/src/pages/api/admin/messages.ts`
- Delete: `website/src/pages/api/admin/messages/[threadId].ts`

- [ ] **Step 1: Delete all obsolete API route files**

```bash
rm website/src/pages/api/portal/messages.ts
rm website/src/pages/api/portal/messages/[threadId].ts
rmdir website/src/pages/api/portal/messages 2>/dev/null || true
rm -f website/src/pages/api/portal/nachrichten.ts
rm website/src/pages/api/admin/messages.ts
rm website/src/pages/api/admin/messages/[threadId].ts
rmdir website/src/pages/api/admin/messages 2>/dev/null || true
```

- [ ] **Step 2: Verify files are gone**

```bash
ls website/src/pages/api/portal/messages.ts 2>&1
ls website/src/pages/api/admin/messages.ts 2>&1
```

Expected: `No such file or directory` for both

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove obsolete direct-message API routes"
```

---

### Task 7: Remove obsolete pages and components

**Files:**
- Delete: `website/src/pages/portal/nachrichten.astro`
- Delete: `website/src/pages/admin/nachrichten.astro`
- Delete: `website/src/components/MessagePanel.svelte`
- Delete: `website/src/components/portal/NachrichtenSection.astro`

- [ ] **Step 1: Delete all obsolete files**

```bash
rm website/src/pages/portal/nachrichten.astro
rm website/src/pages/admin/nachrichten.astro
rm website/src/components/MessagePanel.svelte
rm website/src/components/portal/NachrichtenSection.astro
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove obsolete MessagePanel, NachrichtenSection, nachrichten pages"
```

---

### Task 8: Update layouts — remove Nachrichten nav items

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`
- Modify: `website/src/layouts/PortalLayout.astro`

- [ ] **Step 1: Remove Nachrichten link from AdminLayout.astro**

In `website/src/layouts/AdminLayout.astro`, find and remove the line:
```
{ href: '/admin/nachrichten',   label: 'Nachrichten',   icon: 'message' },
```

- [ ] **Step 2: Remove Nachrichten from PortalLayout navGroups**

In `website/src/layouts/PortalLayout.astro`, find the `Kommunikation` nav group and remove the nachrichten item. The group should become:

```typescript
  {
    label: 'Kommunikation',
    items: [
      { id: 'besprechungen', label: 'Besprechungen', icon: 'besprechungen' },
    ],
  },
```

- [ ] **Step 3: Remove nachrichten icon from PortalLayout icons map**

In `website/src/layouts/PortalLayout.astro`, find and remove:
```typescript
  nachrichten:    `<svg ...>...</svg>`,
```

- [ ] **Step 4: Remove unreadMessages from PortalLayout Props interface**

In `website/src/layouts/PortalLayout.astro`, update the Props interface:
```typescript
interface Props {
  title: string;
  section: string;
  session: UserSession;
  pendingSignatures: number;
}
```

And remove it from the destructured props:
```typescript
const { title, section, session, pendingSignatures } = Astro.props;
```

- [ ] **Step 5: Fix all portal pages that pass unreadMessages to PortalLayout**

Run to find all callers:
```bash
grep -r "unreadMessages" website/src/pages/portal/ --include="*.astro" -l
grep -r "unreadMessages" website/src/pages/portal.astro
```

For each file found, remove the `unreadMessages` computation and prop passing. The prop is typically computed like:
```typescript
const unreadCount = thread ? (await getUnreadForCustomer(...)) : 0;
```
and passed as `unreadMessages={unreadCount}` to the layout. Remove both the computation and the prop.

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
cd website && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors related to removed thread functions or nachrichten references.

- [ ] **Step 7: Commit**

```bash
git add website/src/layouts/AdminLayout.astro website/src/layouts/PortalLayout.astro
git add -u website/src/pages/portal/
git add -u website/src/pages/portal.astro 2>/dev/null || true
git commit -m "chore: remove Nachrichten nav items from Admin + Portal layouts"
```

---

### Task 9: Update portal/index.astro — remove thread references

**Files:**
- Modify: `website/src/pages/portal/index.astro`

- [ ] **Step 1: Replace the entire file**

The current file shows a thread link and room links. After migration, remove the thread link. Direct rooms now appear in `listRoomsForCustomer` but we hide them (since they're accessed via the widget):

```astro
---
import Layout from '../../layouts/Layout.astro';
import { getSession, getLoginUrl } from '../../lib/auth';
import { getCustomerByEmail, listRoomsForCustomer } from '../../lib/messaging-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl('/portal'));

let rooms: Awaited<ReturnType<typeof listRoomsForCustomer>> = [];
try {
  const customer = await getCustomerByEmail(session.email);
  if (customer) rooms = await listRoomsForCustomer(customer.id);
} catch (err) {
  console.error('[portal] DB error:', err);
}

const groupRooms = rooms.filter(r => !r.is_direct);
---

<Layout title="Mein Portal">
  <main style="max-width:600px;margin:48px auto;padding:0 16px">
    <h1>Willkommen, {session.given_name ?? session.name}</h1>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:24px">
      {groupRooms.map(room => (
        <a href={`/portal/raum/${room.id}`} style="display:flex;justify-content:space-between;align-items:center;background:#1e1e2e;border-radius:8px;padding:16px 20px;text-decoration:none;color:#e8e8f0">
          <span>🏠 {room.name}</span>
          <span style="color:#666;font-size:13px">Öffnen →</span>
        </a>
      ))}
      {groupRooms.length === 0 && (
        <p style="color:#666;font-size:14px">Keine Gruppenräume vorhanden.</p>
      )}
    </div>
  </main>
</Layout>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/portal/index.astro
git commit -m "chore: remove thread link from portal index, hide direct rooms"
```

---

### Task 10: Update notify-unread.ts — remove direct message query

**Files:**
- Modify: `website/src/pages/api/cron/notify-unread.ts`

- [ ] **Step 1: Replace the entire file**

Remove the `directRows` query entirely. Only the room-based query remains. Update the portal URL to point to `/portal`:

```typescript
// website/src/pages/api/cron/notify-unread.ts
// Called by K8s CronJob every 6h. Sends one email per customer who has unread room messages older than 72h.
import type { APIRoute } from 'astro';
import { sendEmail } from '../../../lib/email';
import pg from 'pg';
const { Pool } = pg;

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const BRAND_NAME  = process.env.BRAND_NAME || 'Workspace';
const SITE_URL    = process.env.SITE_URL || '';

const pool = new Pool({ connectionString: DB_URL });

interface UnreadRow {
  customer_email: string;
  customer_name: string;
  unread_count: string;
  message_ids: number[];
}

export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? '';
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const { rows } = await pool.query<UnreadRow>(`
      SELECT c.email AS customer_email, c.name AS customer_name,
             count(cm.id)::text AS unread_count,
             array_agg(cm.id) AS message_ids
      FROM chat_messages cm
      JOIN chat_room_members crm ON crm.room_id = cm.room_id
      JOIN customers c ON c.id = crm.customer_id
      WHERE cm.notification_sent_at IS NULL
        AND cm.created_at < NOW() - INTERVAL '72 hours'
        AND cm.sender_id != c.keycloak_user_id
        AND NOT EXISTS (
          SELECT 1 FROM chat_message_reads r
          WHERE r.message_id = cm.id AND r.customer_id = c.id
        )
      GROUP BY c.email, c.name
    `);

    const client = await pool.connect();
    let emailsSent = 0;
    try {
      for (const row of rows) {
        const unread = parseInt(row.unread_count, 10);
        const portalUrl = `${SITE_URL}/portal`;

        await sendEmail({
          to: row.customer_email,
          subject: `Sie haben ${unread} ungelesene Nachricht${unread > 1 ? 'en' : ''} auf ${BRAND_NAME}`,
          text: `Hallo ${row.customer_name},\n\nSie haben ${unread} ungelesene Nachricht${unread > 1 ? 'en' : ''} in Ihrem Portal.\n\nJetzt lesen: ${portalUrl}\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
          html: `<p>Hallo ${row.customer_name},</p><p>Sie haben <strong>${unread} ungelesene Nachricht${unread > 1 ? 'en' : ''}</strong> in Ihrem Portal.</p><p><a href="${portalUrl}" style="display:inline-block;background:#7c6ff7;color:#fff;padding:12px 24px;border-radius:25px;text-decoration:none;font-weight:bold">Portal öffnen</a></p><p>Mit freundlichen Grüßen<br>${BRAND_NAME}</p>`,
        });
        emailsSent++;

        await client.query(
          `UPDATE chat_messages SET notification_sent_at = NOW() WHERE id = ANY($1)`,
          [row.message_ids],
        );
      }
    } finally {
      client.release();
    }

    console.log(`[notify-unread] Sent ${emailsSent} notification emails`);
    return new Response(JSON.stringify({ emailsSent }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-unread]', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/api/cron/notify-unread.ts
git commit -m "chore: notify-unread no longer queries direct messages (consolidated into rooms)"
```

---

### Task 11: Final TypeScript check and deploy

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check**

```bash
cd website && npx tsc --noEmit 2>&1
```

Expected: No errors. If there are errors, fix them (likely stale imports referencing removed types/functions).

- [ ] **Step 2: Check for any remaining references to removed functions**

```bash
grep -r "MessageThread\|getThreadByCustomerId\|getOrCreateThread\|listThreadsForAdmin\|markThreadRead\|addMessage\|getThread\b\|getThreadMessages" website/src --include="*.ts" --include="*.astro" --include="*.svelte"
```

Expected: No output (all removed)

- [ ] **Step 3: Check for remaining references to removed pages**

```bash
grep -r "portal/nachrichten\|admin/nachrichten\|api/portal/messages\|api/admin/messages\b" website/src --include="*.ts" --include="*.astro" --include="*.svelte"
```

Expected: No output (or only in datenschutz.astro as a static text mention — that's OK)

- [ ] **Step 4: Rebuild website**

```bash
task website:redeploy
```

Expected: Build succeeds, pod restarts cleanly

- [ ] **Step 5: Smoke test**

1. Open browser at `https://web.localhost` (or dev URL)
2. Log in as a non-admin user
3. Verify the 💬 floating button appears
4. Click it — a two-panel popup opens with room list on the left
5. Verify "Chat mit Admin" room appears and is pre-selected
6. Send a test message
7. Verify the message appears on the right side
8. Log in as admin, go to `/admin/raeume`, verify the direct room appears

- [ ] **Step 6: Final commit if any fixup needed**

```bash
git add -A
git commit -m "fix(chat): cleanup remaining references after consolidation"
```
