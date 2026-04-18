<script lang="ts">
  import type { ChatRoom, ChatMessage } from '../lib/messaging-db';

  type Member = { customer_id: string; name: string; email: string };
  type Customer = { id: string; name: string; email: string };

  const {
    rooms: initialRooms,
    role,
    messagesBaseUrl,
  }: {
    rooms: ChatRoom[];
    role: 'admin' | 'user';
    messagesBaseUrl: string;
  } = $props();

  let rooms = $state<ChatRoom[]>(initialRooms);
  let activeRoom = $state<ChatRoom | null>(null);
  let messages = $state<ChatMessage[]>([]);
  let members = $state<Member[]>([]);
  let newBody = $state('');
  let sending = $state(false);
  let lastId = $state(0);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  let showNewRoom = $state(false);
  let newRoomName = $state('');

  let showMembers = $state(false);
  let allCustomers = $state<Customer[]>([]);
  let memberSearch = $state('');
  let memberLoading = $state(false);

  // Admin uses /api/admin/rooms/[id] (no /messages suffix)
  // Portal uses /api/portal/rooms/[id]/messages
  function roomUrl(roomId: number) {
    return role === 'admin'
      ? `${messagesBaseUrl}/${roomId}`
      : `${messagesBaseUrl}/${roomId}/messages`;
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!activeRoom) return;
      const res = await fetch(`${roomUrl(activeRoom.id)}?after=${lastId}`);
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
    showMembers = false;
    try {
      const res = await fetch(roomUrl(room.id));
      const data = await res.json() as { messages: ChatMessage[]; members?: Member[] };
      messages = data.messages;
      members = data.members ?? [];
      lastId = messages.length ? messages[messages.length - 1].id : 0;
    } catch {
      messages = [];
      members = [];
      lastId = 0;
    }
    startPolling();
  }

  async function sendMessage() {
    if (!newBody.trim() || !activeRoom || sending) return;
    sending = true;
    const res = await fetch(roomUrl(activeRoom.id), {
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
    const res = await fetch(messagesBaseUrl, {
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

  async function openMembers() {
    showMembers = !showMembers;
    if (showMembers && allCustomers.length === 0) {
      memberLoading = true;
      try {
        const res = await fetch('/api/admin/customers');
        const data = await res.json() as { customers: Customer[] };
        allCustomers = data.customers;
      } finally {
        memberLoading = false;
      }
    }
  }

  async function toggleMember(customer: Customer) {
    if (!activeRoom) return;
    const isMember = members.some(m => m.customer_id === customer.id);
    const res = await fetch(`${messagesBaseUrl}/${activeRoom.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: customer.id, action: isMember ? 'remove' : 'add' }),
    });
    if (res.ok) {
      if (isMember) {
        members = members.filter(m => m.customer_id !== customer.id);
      } else {
        members = [...members, { customer_id: customer.id, name: customer.name, email: customer.email }];
      }
    }
  }

  let filteredCustomers = $derived(
    allCustomers.filter(c =>
      !memberSearch || c.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      c.email.toLowerCase().includes(memberSearch.toLowerCase())
    )
  );

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
      <div class="chat-header">
        <span>{activeRoom.name}</span>
        {#if role === 'admin'}
          <button class="btn-members" onclick={openMembers}>
            👥 Mitglieder ({members.length})
          </button>
        {/if}
      </div>

      {#if showMembers && role === 'admin'}
        <div class="members-panel">
          <div class="members-search">
            <input bind:value={memberSearch} placeholder="Kunde suchen…" />
          </div>
          {#if memberLoading}
            <p class="members-hint">Lade…</p>
          {:else if allCustomers.length === 0}
            <p class="members-hint">Keine Kunden vorhanden.</p>
          {:else}
            <ul class="members-list">
              {#each filteredCustomers as c (c.id)}
                {@const isMember = members.some(m => m.customer_id === c.id)}
                <li class="member-row {isMember ? 'is-member' : ''}">
                  <span class="member-name">{c.name}</span>
                  <span class="member-email">{c.email}</span>
                  <button class="btn-toggle" onclick={() => toggleMember(c)}>
                    {isMember ? '−' : '+'}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

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
  .chat-header { padding: 10px 16px; border-bottom: 1px solid #2a2a3e; font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center; }
  .btn-members { background: #374151; color: #ccc; border: none; border-radius: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
  .btn-members:hover { background: #4b5563; }
  .members-panel { border-bottom: 1px solid #2a2a3e; background: #13131f; max-height: 240px; display: flex; flex-direction: column; }
  .members-search { padding: 8px 12px; border-bottom: 1px solid #2a2a3e; }
  .members-search input { width: 100%; background: #1e1e2e; color: #e8e8f0; border: 1px solid #374151; border-radius: 4px; padding: 5px 8px; font-size: 12px; box-sizing: border-box; }
  .members-hint { color: #555; font-size: 12px; padding: 10px 12px; margin: 0; }
  .members-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
  .member-row { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid #1e1e2e; }
  .member-row.is-member { background: #1a2435; }
  .member-name { font-size: 12px; color: #e8e8f0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .member-email { font-size: 11px; color: #666; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn-toggle { background: #374151; color: #e8e8f0; border: none; border-radius: 4px; padding: 2px 8px; font-size: 14px; cursor: pointer; font-weight: bold; flex-shrink: 0; }
  .member-row.is-member .btn-toggle { background: #7f1d1d; color: #fca5a5; }
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
