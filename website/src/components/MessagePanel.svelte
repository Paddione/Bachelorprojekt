<script lang="ts">
  import type { MessageThread, Message } from '../lib/messaging-db';

  const {
    threads: initialThreads,
    role,
    listUrl,
    customers,
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
  let newBody2 = $state('');

  async function openThread(thread: MessageThread) {
    activeThread = thread;
    loadingThread = true;
    const res = await fetch(`${listUrl}/${thread.id}`);
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

  <main class="thread-view">
    {#if !activeThread}
      {#if !hasThread && role === 'user'}
        <div class="compose">
          <p class="hint">Schreiben Sie eine Nachricht an den Admin.</p>
          <textarea bind:value={newBody} placeholder="Ihre Nachricht…" rows="4"
            onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startUserThread(); } }}></textarea>
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
