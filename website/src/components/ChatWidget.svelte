<script lang="ts">
  import type { Message, MessageThread } from '../lib/messaging-db';

  type AuthResponse = { authenticated: false } | { authenticated: true; user: { name: string; isAdmin: boolean } };

  let open = $state(false);
  let visible = $state(false);
  let thread = $state<MessageThread | null>(null);
  let messages = $state<Message[]>([]);
  let newBody = $state('');
  let sending = $state(false);
  let loading = $state(true);
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let msgContainer = $state<HTMLDivElement | null>(null);

  $effect(() => {
    initWidget();
    return () => { if (pollInterval) clearInterval(pollInterval); };
  });

  async function initWidget() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json() as AuthResponse;
      if (!data.authenticated) return;
      visible = true;
      await loadThread();
    } finally {
      loading = false;
    }
  }

  async function loadThread() {
    const res = await fetch('/api/portal/messages');
    if (!res.ok) return;
    const data = await res.json() as { thread: MessageThread | null };
    thread = data.thread;
    if (thread) {
      await fetchMessages();
    }
  }

  async function fetchMessages() {
    if (!thread) return;
    const res = await fetch(`/api/portal/messages/${thread.id}`);
    if (!res.ok) return;
    const data = await res.json() as { messages: Message[] };
    messages = data.messages;
    scrollToBottom();
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!open || !thread) return;
      await fetchMessages();
    }, 5000);
  }

  async function toggleOpen() {
    open = !open;
    if (open) {
      if (!thread) await loadThread();
      else await fetchMessages();
      startPolling();
      scrollToBottom();
    } else {
      if (pollInterval) clearInterval(pollInterval);
    }
  }

  async function sendMessage() {
    if (!newBody.trim() || sending) return;
    sending = true;
    const body = newBody.trim();
    newBody = '';
    try {
      const url = thread ? `/api/portal/messages/${thread.id}` : '/api/portal/messages';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const data = await res.json() as { message: Message; thread?: MessageThread };
        if (data.thread) thread = data.thread;
        messages = [...messages, data.message];
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
</script>

{#if visible}
  <div class="chat-widget">
    {#if open}
      <div class="chat-panel">
        <div class="chat-header">
          <span>💬 Nachrichten</span>
          <button class="close-btn" onclick={toggleOpen} aria-label="Schließen">✕</button>
        </div>
        <div class="chat-body" bind:this={msgContainer}>
          {#if loading}
            <p class="chat-hint">Lade…</p>
          {:else if messages.length === 0}
            <p class="chat-hint">Noch keine Nachrichten. Schreib uns gerne!</p>
          {:else}
            {#each messages as msg (msg.id)}
              <div class="chat-msg {msg.sender_role === 'user' ? 'msg-me' : 'msg-admin'}">
                <span class="msg-text">{msg.body}</span>
                <span class="msg-time">
                  {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            {/each}
          {/if}
        </div>
        <div class="chat-footer">
          <textarea
            bind:value={newBody}
            onkeydown={handleKeydown}
            placeholder="Nachricht schreiben… (Enter zum Senden)"
            rows="2"
            disabled={sending}
          ></textarea>
          <button class="send-btn" onclick={sendMessage} disabled={!newBody.trim() || sending}>
            {sending ? '…' : '➤'}
          </button>
        </div>
      </div>
    {/if}
    <button class="toggle-btn" onclick={toggleOpen} aria-label="Chat öffnen/schließen">
      {open ? '✕' : '💬'}
    </button>
  </div>
{/if}

<style>
  .chat-widget {
    position: fixed;
    bottom: 24px;
    right: 168px;
    z-index: 9000;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
  }
  .chat-panel {
    width: 320px;
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
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 220px;
    max-height: 340px;
  }
  .chat-hint {
    font-size: 12px;
    color: #8899aa;
    text-align: center;
    margin: auto 0;
  }
  .chat-msg {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 85%;
  }
  .msg-me { align-self: flex-end; }
  .msg-admin { align-self: flex-start; }
  .msg-text {
    padding: 8px 12px;
    border-radius: 12px;
    font-size: 13px;
    color: #e8e8f0;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
  }
  .msg-me .msg-text { background: #e8c870; color: #0f1623; border-bottom-right-radius: 4px; }
  .msg-admin .msg-text { background: #243049; border-bottom-left-radius: 4px; }
  .msg-time {
    font-size: 10px;
    color: #5566aa;
    padding: 0 4px;
  }
  .msg-me .msg-time { align-self: flex-end; }
  .chat-footer {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid #243049;
    align-items: flex-end;
  }
  .chat-footer textarea {
    flex: 1;
    background: #0f1623;
    color: #e8e8f0;
    border: 1px solid #374151;
    border-radius: 8px;
    padding: 8px;
    font-size: 13px;
    resize: none;
    box-sizing: border-box;
    font-family: inherit;
    line-height: 1.4;
  }
  .chat-footer textarea:focus { outline: none; border-color: #e8c870; }
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
</style>
