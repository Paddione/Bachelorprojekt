<!-- website/src/components/LiveStream/StreamHandRaise.svelte -->
<script lang="ts">
  import type { Room } from 'livekit-client';
  import { RoomEvent } from 'livekit-client';

  let { room, isHost = false }: { room: Room; isHost?: boolean } = $props();

  let raised = $state(false);
  type RaiseRequest = { userId: string; userName: string };
  let queue = $state<RaiseRequest[]>([]);

  $effect(() => {
    const handler = (payload: Uint8Array) => {
      const msg = JSON.parse(new TextDecoder().decode(payload));
      if (msg.type === 'raise') {
        if (isHost) {
          queue = [...queue.filter(r => r.userId !== msg.userId), { userId: msg.userId, userName: msg.userName }];
        }
      }
      if (msg.type === 'lower') {
        queue = queue.filter(r => r.userId !== msg.userId);
      }
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  });

  function toggleRaise() {
    raised = !raised;
    const type = raised ? 'raise' : 'lower';
    const payload = new TextEncoder().encode(JSON.stringify({
      type,
      userId: room.localParticipant.identity,
      userName: room.localParticipant.name ?? 'Unbekannt',
    }));
    room.localParticipant.publishData(payload, { reliable: true });
  }

  function grantMic(userId: string) {
    const payload = new TextEncoder().encode(JSON.stringify({ type: 'grant', userId }));
    room.localParticipant.publishData(payload, { reliable: true });
    queue = queue.filter(r => r.userId !== userId);
  }
</script>

{#if isHost}
  {#if queue.length > 0}
    <div class="bg-dark-light border border-dark-lighter rounded-xl p-4">
      <h3 class="text-sm font-semibold text-light mb-2">✋ Wortmeldungen ({queue.length})</h3>
      <ul class="space-y-2">
        {#each queue as req (req.userId)}
          <li class="flex items-center justify-between">
            <span class="text-sm text-light">{req.userName}</span>
            <button
              onclick={() => grantMic(req.userId)}
              class="text-xs bg-gold text-dark px-2 py-1 rounded font-semibold hover:bg-gold/80"
            >Mikro freigeben</button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
{:else}
  <button
    onclick={toggleRaise}
    class="px-4 py-2 rounded-lg border text-sm font-semibold transition-colors
           {raised ? 'bg-gold text-dark border-gold' : 'bg-dark-light border-dark-lighter text-light hover:border-gold'}"
  >
    ✋ {raised ? 'Wortmeldung zurückziehen' : 'Wortmeldung'}
  </button>
{/if}
