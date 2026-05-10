<script lang="ts">
  import type { AssistantProfile, Message } from '../../lib/assistant/types';
  import AssistantMessage from './AssistantMessage.svelte';
  import AssistantConfirmCard from './AssistantConfirmCard.svelte';

  let { profile, onClose }: { profile: AssistantProfile; onClose?: () => void } = $props();

  let messages = $state<(Message & { sourcesUsed?: number })[]>([]);
  let input = $state('');
  let sending = $state(false);
  let busyAction = $state<string | null>(null);

  let useBooks = $state(sessionStorage.getItem('assistant-use-books') === '1');

  function toggleBooks() {
    useBooks = !useBooks;
    sessionStorage.setItem('assistant-use-books', useBooks ? '1' : '0');
  }

  async function send(content: string) {
    sending = true;
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile, content, currentRoute: location.pathname, useBooks }),
      });
      const data = await res.json();
      if (data?.message) {
        messages = [
          ...messages,
          { id: 'optimistic-' + Date.now(), conversationId: '', role: 'user', content, createdAt: new Date().toISOString() },
          { ...data.message, sourcesUsed: data.sourcesUsed ?? 0 },
        ];
      }
    } finally {
      sending = false;
      input = '';
    }
  }

  async function confirmAction(message: Message) {
    if (!message.proposedAction) return;
    busyAction = message.id;
    try {
      const res = await fetch('/api/assistant/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile, actionId: message.proposedAction.actionId, payload: message.proposedAction.payload }),
      });
      const data = await res.json();
      const replyText = data?.result?.message ?? (data?.error ? `Fehler: ${data.error}` : 'OK');
      messages = [...messages, { id: `local-${Date.now()}`, conversationId: '', role: 'assistant', content: replyText, createdAt: new Date().toISOString() }];
      messages = messages.map((m) => m.id === message.id ? { ...m, proposedAction: undefined } : m);
    } finally {
      busyAction = null;
    }
  }
  function cancelAction(message: Message) {
    messages = [...messages, { id: `local-${Date.now()}`, conversationId: '', role: 'assistant', content: 'OK, lasse ich.', createdAt: new Date().toISOString() }];
    messages = messages.map((m) => m.id === message.id ? { ...m, proposedAction: undefined } : m);
  }
</script>

<section
  role="dialog" aria-modal="false" aria-label="Mentolder-Assistent"
  style="position: fixed; right: 24px; bottom: 24px; z-index: 53;
         width: 320px; height: 400px;
         background: var(--ink-850); border: 1px solid #d7b06a; border-radius: 12px;
         box-shadow: 0 12px 32px rgba(0,0,0,.6);
         display: flex; flex-direction: column; overflow: hidden;
         font-family: var(--font-sans);"
>
  <header style="padding: 10px 12px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; background: var(--ink-900);">
    <span style="font-family: var(--font-display); color: #d7b06a; font-size: 14px;">✦ Mentolder-Assistent</span>
    <button onclick={onClose} aria-label="Chat schließen" style="background: none; border: none; color: var(--mute); font-size: 16px; cursor: pointer;">✕</button>
  </header>
  <div style="flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
    {#each messages as m (m.id)}
      <AssistantMessage message={m} sourcesUsed={m.sourcesUsed ?? 0} />
      {#if m.role === 'assistant' && m.proposedAction}
        <AssistantConfirmCard
          action={m.proposedAction}
          busy={busyAction === m.id}
          onConfirm={() => confirmAction(m)}
          onCancel={() => cancelAction(m)}
        />
      {/if}
    {/each}
  </div>
  <form
    onsubmit={(e) => { e.preventDefault(); if (input.trim()) send(input.trim()); }}
    style="padding: 8px 10px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; background: var(--ink-900);"
  >
    <div style="display: flex; gap: 6px;">
      <input
        bind:value={input}
        type="text"
        placeholder="Nachricht eingeben…"
        disabled={sending}
        style="flex: 1; background: var(--ink-850); border: 1px solid var(--line); border-radius: 16px; padding: 6px 12px; font-size: 12px; color: var(--fg); font-family: inherit;"
      />
    </div>
    <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
      <button
        type="button"
        onclick={toggleBooks}
        style="display: flex; align-items: center; gap: 4px; padding: 2px 8px;
               background: {useBooks ? 'rgba(215,176,106,.15)' : 'transparent'};
               border: 1px solid {useBooks ? '#d7b06a' : 'var(--line)'};
               border-radius: 12px; font-size: 10px; cursor: pointer;
               color: {useBooks ? '#d7b06a' : 'var(--mute)'}; font-family: inherit;"
        title="Coaching-Bücher in die Antwort einbeziehen"
      >
        {#if useBooks}
          <span style="width: 6px; height: 6px; background: #d7b06a; border-radius: 50%; display: inline-block;"></span>
        {/if}
        📚 {useBooks ? 'Bücher aktiv' : 'Bücher'}
      </button>
    </div>
  </form>
</section>