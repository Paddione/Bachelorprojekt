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
  let adminMode = $state(false);
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
      if (!data.authenticated) return;
      adminMode = data.user.isAdmin;
      visible = true;
      if (adminMode) {
        await loadRooms();
        if (rooms.length > 0) { activeRoomId = rooms[0].id; await loadMessages(); }
      } else {
        const dr = await fetch('/api/portal/rooms/ensure-direct', { method: 'POST' });
        if (!dr.ok) return;
        const { room_id, customer_id } = await dr.json() as { room_id: number; customer_id: string };
        customerId = customer_id;
        await loadRooms();
        activeRoomId = room_id;
        await loadMessages();
      }
      startPolling();
    } finally {
      loading = false;
    }
  }

  async function loadRooms() {
    if (adminMode) {
      const res = await fetch('/api/admin/rooms');
      if (!res.ok) return;
      const data = await res.json() as { rooms: Array<{ id: number; name: string; is_direct: boolean; direct_customer_id: string | null }> };
      rooms = data.rooms.map(r => ({ id: r.id, name: r.name, is_direct: r.is_direct, direct_customer_id: r.direct_customer_id, lastMessageBody: null, lastMessageSenderName: null, lastMessageAt: null, unreadCount: 0 }));
    } else {
      const res = await fetch('/api/portal/rooms');
      if (!res.ok) return;
      const data = await res.json() as { rooms: RoomInboxItem[] };
      rooms = data.rooms;
    }
  }

  function msgUrl(roomId: number, afterId?: number): string {
    if (adminMode) return afterId !== undefined ? `/api/admin/rooms/${roomId}?after=${afterId}` : `/api/admin/rooms/${roomId}`;
    return afterId !== undefined ? `/api/portal/rooms/${roomId}/messages?after=${afterId}` : `/api/portal/rooms/${roomId}/messages`;
  }

  async function loadMessages() {
    if (!activeRoomId) return;
    const res = await fetch(msgUrl(activeRoomId));
    if (!res.ok) return;
    const data = await res.json() as { messages: ChatMessage[] };
    messages = data.messages;
    lastId = messages.length ? messages[messages.length - 1].id : 0;
    scrollToBottom();
  }

  async function selectRoom(roomId: number) {
    if (pollInterval) clearInterval(pollInterval);
    activeRoomId = roomId; messages = []; lastId = 0;
    await loadMessages();
    startPolling();
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!activeRoomId) return;
      const res = await fetch(msgUrl(activeRoomId, lastId));
      if (!res.ok) return;
      const data = await res.json() as { messages: ChatMessage[] };
      if (data.messages.length > 0) {
        messages = [...messages, ...data.messages];
        lastId = data.messages[data.messages.length - 1].id;
        if (open) scrollToBottom();
      }
      await loadRooms();
    }, 5000);
  }

  async function toggleOpen() {
    open = !open;
    if (open) { if (activeRoomId) await loadMessages(); scrollToBottom(); }
  }

  async function sendMessage() {
    if (!newBody.trim() || !activeRoomId || sending) return;
    sending = true;
    const body = newBody.trim(); newBody = '';
    try {
      const url = adminMode ? `/api/admin/rooms/${activeRoomId}` : `/api/portal/rooms/${activeRoomId}/messages`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
      if (res.ok) {
        const data = await res.json() as { message: ChatMessage };
        messages = [...messages, data.message]; lastId = data.message.id; scrollToBottom();
      }
    } finally { sending = false; }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function scrollToBottom() {
    setTimeout(() => { if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight; }, 50);
  }

  function formatTime(d: Date | string) {
    return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function isOwn(msg: ChatMessage) {
    return adminMode ? msg.sender_customer_id === null : msg.sender_customer_id === customerId;
  }
</script>

{#if visible}
  <div class="cw">
    {#if open}
      <div class="panel">
        <div class="hdr">
          <span>💬 {activeRoom?.name ?? 'Chat'}</span>
          <button class="x" onclick={toggleOpen} aria-label="Schließen">✕</button>
        </div>
        <div class="body">
          <aside class="rooms">
            {#each rooms as r (r.id)}
              <button class="ri {activeRoomId === r.id ? 'active' : ''}" onclick={() => selectRoom(r.id)}>
                <span class="rn">{r.name}</span>
                {#if r.unreadCount > 0}<span class="badge">{r.unreadCount > 9 ? '9+' : r.unreadCount}</span>{/if}
              </button>
            {/each}
          </aside>
          <div class="msgs">
            <div class="list" bind:this={msgContainer}>
              {#if loading}<p class="hint">Lade…</p>
              {:else if messages.length === 0}<p class="hint">Noch keine Nachrichten.</p>
              {:else}
                {#each messages as msg (msg.id)}
                  {@const own = isOwn(msg)}
                  <div class="row {own ? 'own' : 'other'}">
                    {#if !own}<span class="who">{msg.sender_name}</span>{/if}
                    <div class="bbl">
                      <span class="txt">{msg.body}</span>
                      <span class="ts">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
            <div class="bar">
              <textarea bind:value={newBody} onkeydown={handleKeydown} placeholder="Nachricht… (Enter)" rows="2" disabled={sending || !activeRoomId}></textarea>
              <button class="send" onclick={sendMessage} disabled={!newBody.trim() || sending || !activeRoomId}>{sending ? '…' : '➤'}</button>
            </div>
          </div>
        </div>
      </div>
    {/if}
    <button class="fab" onclick={toggleOpen} aria-label="Chat">
      {#if totalUnread > 0 && !open}<span class="dot">{totalUnread > 9 ? '9+' : totalUnread}</span>{/if}
      {open ? '✕' : '💬'}
    </button>
  </div>
{/if}

<style>
  .cw { position: fixed; bottom: 24px; right: 90px; z-index: 9000; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .panel { width: 560px; height: 440px; background: #1a2235; border: 1px solid #243049; border-radius: 12px; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,.5); overflow: hidden; }
  .hdr { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #243049; font-size: 14px; font-weight: 600; color: #e8e8f0; flex-shrink: 0; }
  .x { background: transparent; border: none; color: #aabbcc; cursor: pointer; font-size: 14px; padding: 0; line-height: 1; }
  .body { display: flex; flex: 1; min-height: 0; }
  .rooms { width: 160px; flex-shrink: 0; border-right: 1px solid #243049; overflow-y: auto; display: flex; flex-direction: column; }
  .ri { width: 100%; background: transparent; border: none; border-bottom: 1px solid #1e2a3a; text-align: left; padding: 10px 12px; cursor: pointer; color: #aabbcc; font-size: 12px; display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .ri.active { background: #243049; color: #e8e8f0; }
  .ri:hover:not(.active) { background: #1e2a3a; }
  .rn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { flex-shrink: 0; background: #3b82f6; color: #fff; border-radius: 999px; font-size: 10px; font-weight: 700; padding: 1px 5px; font-family: monospace; }
  .msgs { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .list { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
  .hint { font-size: 12px; color: #8899aa; text-align: center; margin: auto 0; }
  .row { display: flex; flex-direction: column; gap: 2px; max-width: 88%; }
  .row.own { align-self: flex-end; }
  .row.other { align-self: flex-start; }
  .who { font-size: 10px; color: #5566aa; padding: 0 4px; }
  .bbl { display: flex; flex-direction: column; gap: 2px; }
  .txt { padding: 7px 11px; border-radius: 12px; font-size: 13px; color: #e8e8f0; white-space: pre-wrap; word-break: break-word; line-height: 1.4; }
  .row.own .txt { background: #e8c870; color: #0f1623; border-bottom-right-radius: 4px; }
  .row.other .txt { background: #243049; border-bottom-left-radius: 4px; }
  .ts { font-size: 10px; color: #5566aa; padding: 0 4px; }
  .row.own .ts { align-self: flex-end; }
  .bar { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #243049; align-items: flex-end; flex-shrink: 0; }
  .bar textarea { flex: 1; background: #0f1623; color: #e8e8f0; border: 1px solid #374151; border-radius: 8px; padding: 7px; font-size: 13px; resize: none; box-sizing: border-box; font-family: inherit; line-height: 1.4; }
  .bar textarea:focus { outline: none; border-color: #e8c870; }
  .send { background: #e8c870; color: #0f1623; border: none; border-radius: 8px; padding: 8px 12px; font-size: 16px; cursor: pointer; font-weight: 700; flex-shrink: 0; align-self: flex-end; }
  .send:disabled { opacity: .5; cursor: not-allowed; }
  .fab { position: relative; width: 52px; height: 52px; border-radius: 50%; background: #e8c870; color: #0f1623; border: none; font-size: 22px; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; transition: transform .15s, box-shadow .15s; }
  .fab:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,0,0,.5); }
  .dot { position: absolute; top: -4px; right: -4px; background: #ef4444; color: #fff; border-radius: 999px; font-size: 10px; font-weight: 700; padding: 2px 5px; font-family: monospace; min-width: 18px; text-align: center; line-height: 1.4; pointer-events: none; }
</style>
