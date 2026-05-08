<script lang="ts">
  import type { AssistantProfile, Message } from '../../lib/assistant/types';
  import AssistantMessage from './AssistantMessage.svelte';
  import AssistantConfirmCard from './AssistantConfirmCard.svelte';

  let { profile, onClose }: { profile: AssistantProfile; onClose?: () => void } = $props();

  let messages = $state<Message[]>([]);
  let input = $state('');
  let sending = $state(false);
  let recording = $state(false);
  let busyAction = $state<string | null>(null);
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: BlobPart[] = [];

  async function send(content: string) {
    sending = true;
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile, content, currentRoute: location.pathname }),
      });
      const data = await res.json();
      if (data?.message) {
        messages = [
          ...messages,
          { id: 'optimistic-' + Date.now(), conversationId: '', role: 'user', content, createdAt: new Date().toISOString() },
          data.message,
        ];
      }
    } finally {
      sending = false;
      input = '';
    }
  }

  async function startRecording() {
    if (recording) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    chunks = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      stream.getTracks().forEach((t) => t.stop());
      const fd = new FormData(); fd.append('audio', blob, 'voice.webm');
      const r = await fetch('/api/assistant/transcribe', { method: 'POST', body: fd });
      const j = await r.json();
      if (j?.text) await send(j.text);
    };
    mediaRecorder.start();
    recording = true;
  }
  function stopRecording() {
    if (!recording) return;
    mediaRecorder?.stop();
    recording = false;
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
      <AssistantMessage message={m} />
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
    style="padding: 8px 10px; border-top: 1px solid var(--line); display: flex; gap: 6px; background: var(--ink-900);"
  >
    <input
      bind:value={input}
      type="text"
      placeholder="Frag etwas oder halte das Mikro…"
      disabled={sending || recording}
      style="flex: 1; background: var(--ink-850); border: 1px solid var(--line); border-radius: 16px; padding: 6px 12px; font-size: 12px; color: var(--fg); font-family: inherit;"
    />
    <button
      type="button"
      aria-label={recording ? 'Aufnahme stoppen' : 'Aufnahme starten (drücken & halten)'}
      onpointerdown={startRecording}
      onpointerup={stopRecording}
      onpointerleave={stopRecording}
      disabled={sending}
      class:rec={recording}
      style="width: 32px; height: 32px; border-radius: 50%; border: none; cursor: pointer;
             background: {recording ? '#d96b6b' : '#d7b06a'}; color: #0b111c; font-size: 14px;"
    >●</button>
  </form>
</section>

<style>
  .rec { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(217,107,107,.6); }
    50% { box-shadow: 0 0 0 8px rgba(217,107,107,0); }
  }
</style>
