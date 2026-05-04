<!-- website/src/components/LiveStream/StreamChat.svelte -->
<script lang="ts">
  import type { Room, RemoteParticipant, LocalParticipant } from 'livekit-client';
  import { RoomEvent } from 'livekit-client';

  let { room }: { room: Room } = $props();

  type ChatMessage = { id: string; sender: string; text: string; at: number };
  let messages = $state<ChatMessage[]>([]);
  let text = $state('');
  let listEl: HTMLDivElement;

  $effect(() => {
    const handler = (payload: Uint8Array, participant?: RemoteParticipant | LocalParticipant) => {
      const msg = JSON.parse(new TextDecoder().decode(payload));
      if (msg.type !== 'chat') return;
      messages = [...messages, {
        id: crypto.randomUUID(),
        sender: participant?.name ?? 'Anonym',
        text: msg.text,
        at: Date.now(),
      }];
      setTimeout(() => listEl?.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' }), 50);
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  });

  function send() {
    if (!text.trim()) return;
    const payload = new TextEncoder().encode(JSON.stringify({ type: 'chat', text: text.trim() }));
    room.localParticipant.publishData(payload, { reliable: true });
    messages = [...messages, { id: crypto.randomUUID(), sender: 'Du', text: text.trim(), at: Date.now() }];
    text = '';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }
</script>

<div class="flex flex-col h-full bg-dark-light border-l border-dark-lighter">
  <div class="px-3 py-2 border-b border-dark-lighter text-sm font-semibold text-light">
    Chat <span class="text-muted font-normal">({room.numParticipants} online)</span>
  </div>
  <div bind:this={listEl} class="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm">
    {#each messages as m (m.id)}
      <div>
        <span class="text-gold font-semibold">{m.sender}</span>
        <span class="text-light ml-1">{m.text}</span>
      </div>
    {/each}
    {#if messages.length === 0}
      <p class="text-muted text-xs">Noch keine Nachrichten.</p>
    {/if}
  </div>
  <div class="px-3 py-2 border-t border-dark-lighter">
    <input
      bind:value={text}
      onkeydown={onKey}
      class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-light placeholder-muted focus:outline-none focus:border-gold"
      placeholder="Nachricht eingeben…"
    />
  </div>
</div>
