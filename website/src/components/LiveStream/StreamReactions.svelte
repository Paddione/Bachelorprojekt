<!-- website/src/components/LiveStream/StreamReactions.svelte -->
<script lang="ts">
  import type { Room } from 'livekit-client';
  import { RoomEvent } from 'livekit-client';

  let { room }: { room: Room } = $props();

  type FloatingEmoji = { id: string; emoji: string; x: number };
  let floating = $state<FloatingEmoji[]>([]);

  const EMOJIS = ['👍', '❤️', '🔥', '😂', '👏'];

  $effect(() => {
    const handler = (payload: Uint8Array) => {
      const msg = JSON.parse(new TextDecoder().decode(payload));
      if (msg.type !== 'reaction') return;
      addFloat(msg.emoji);
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  });

  function addFloat(emoji: string) {
    const id = crypto.randomUUID();
    floating = [...floating, { id, emoji, x: Math.random() * 80 + 10 }];
    setTimeout(() => { floating = floating.filter(f => f.id !== id); }, 2000);
  }

  function react(emoji: string) {
    const payload = new TextEncoder().encode(JSON.stringify({ type: 'reaction', emoji }));
    room.localParticipant.publishData(payload, { reliable: false });
    addFloat(emoji);
  }
</script>

<div class="relative">
  <!-- Floating reactions -->
  <div class="absolute bottom-full left-0 right-0 h-32 pointer-events-none overflow-hidden">
    {#each floating as f (f.id)}
      <span
        class="absolute bottom-0 text-2xl animate-float"
        style="left: {f.x}%"
      >{f.emoji}</span>
    {/each}
  </div>

  <!-- Reaction buttons -->
  <div class="flex gap-2">
    {#each EMOJIS as emoji}
      <button
        onclick={() => react(emoji)}
        class="text-xl px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg hover:border-gold transition-colors"
        aria-label="Reaktion {emoji}"
      >{emoji}</button>
    {/each}
  </div>
</div>

<style>
  @keyframes float {
    0% { transform: translateY(0); opacity: 1; }
    100% { transform: translateY(-120px); opacity: 0; }
  }
  .animate-float {
    animation: float 2s ease-out forwards;
  }
</style>
