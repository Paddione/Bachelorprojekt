<script lang="ts">
  import type { ActiveCallRoom } from '../../../lib/nextcloud-talk-db';
  import ActiveRoomCard from './ActiveRoomCard.svelte';
  import RoomDrawer from './RoomDrawer.svelte';
  import BulkActionsBar from './BulkActionsBar.svelte';

  let { rooms }: { rooms: ActiveCallRoom[] } = $props();

  let activeSessions = $state<string[]>([]);
  let selected = $state<ActiveCallRoom | null>(null);

  async function refreshTranscriptionState() {
    try {
      const res = await fetch('/api/admin/transcription');
      if (!res.ok) return;
      const data = await res.json() as { activeSessions: string[] };
      activeSessions = data.activeSessions ?? [];
    } catch { /* ignore */ }
  }
  $effect(() => { refreshTranscriptionState(); });

  async function startTranscribe(token: string) {
    await fetch('/api/admin/transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'start' }),
    });
    activeSessions = [...activeSessions.filter(t => t !== token), token];
  }
  async function stopTranscribe(token: string) {
    await fetch('/api/admin/transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'stop' }),
    });
    activeSessions = activeSessions.filter(t => t !== token);
  }
</script>

<div data-testid="rooms-board">
  <h2 class="text-xs uppercase tracking-wide text-muted mb-3">Aktive Talk-Räume ({rooms.length})</h2>
  <BulkActionsBar />

  {#if rooms.length === 0}
    <p class="text-muted text-sm">Keine aktiven Calls.</p>
  {:else}
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {#each rooms as r (r.token)}
        <ActiveRoomCard
          room={r}
          transcribing={activeSessions.includes(r.token)}
          onclick={() => selected = r}
        />
      {/each}
    </div>
  {/if}

  <RoomDrawer
    room={selected}
    transcribing={selected ? activeSessions.includes(selected.token) : false}
    onclose={() => selected = null}
    onStartTranscribe={startTranscribe}
    onStopTranscribe={stopTranscribe}
  />
</div>
