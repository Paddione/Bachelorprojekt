<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { LiveCockpitData, LiveState } from '../../lib/live-state';
  import Launchpad from './Launchpad.svelte';
  import RoomsBoard from './rooms/RoomsBoard.svelte';
  import StreamCockpit from './stream/StreamCockpit.svelte';
  import LiveStatusBar from './shared/LiveStatusBar.svelte';
  import LiveToasts, { pushToast } from './shared/LiveToasts.svelte';

  let { livekitUrl, streamDomain, rtmpKey }: { livekitUrl: string; streamDomain: string; rtmpKey: string } = $props();

  const POLL_MS = 5000;

  let data = $state<LiveCockpitData | null>(null);
  let state = $state<LiveState>('empty');
  let loadError = $state<string | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    try {
      const res = await fetch('/api/live/state', { credentials: 'same-origin' });
      if (!res.ok) {
        loadError = `Cockpit nicht erreichbar (${res.status})`;
        return;
      }
      const json = await res.json() as LiveCockpitData & { state: LiveState };

      // Detect transitions for toasts
      const prev = data;
      if (prev) {
        const prevRoomsCount = prev.rooms.length;
        const newRoomsCount = json.rooms.length;
        if (newRoomsCount > prevRoomsCount) pushToast('Neuer Talk-Call gestartet', 'info');
        if (newRoomsCount < prevRoomsCount) pushToast('Talk-Call beendet', 'info');
        if (json.stream.recording && !prev.stream.recording) pushToast('Aufzeichnung läuft', 'ok');
        if (!json.stream.recording && prev.stream.recording) pushToast('Aufzeichnung gespeichert', 'ok');
      }

      data = json;
      state = json.state;
      loadError = null;
    } catch {
      loadError = 'Netzwerkfehler';
    }
  }

  onMount(() => {
    refresh();
    timer = setInterval(refresh, POLL_MS);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

<div class="text-light" data-testid="live-cockpit" data-state={state}>
  {#if loadError}
    <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 mb-4">
      {loadError}
      <button onclick={refresh} class="ml-3 underline">Erneut versuchen</button>
    </div>
  {/if}

  {#if !data}
    <p class="text-muted">Cockpit lädt…</p>
  {:else}
    <LiveStatusBar {data} {state} />

    {#if state === 'empty'}
      <Launchpad {data} />
    {:else if state === 'stream'}
      <StreamCockpit {livekitUrl} {streamDomain} {rtmpKey} pollActive={data.pollActive} />
    {:else if state === 'rooms'}
      <RoomsBoard rooms={data.rooms} />
    {:else}
      <div class="grid grid-cols-3 gap-6">
        <div class="col-span-2"><StreamCockpit {livekitUrl} {streamDomain} {rtmpKey} pollActive={data.pollActive} /></div>
        <div class="col-span-1"><RoomsBoard rooms={data.rooms} /></div>
      </div>
    {/if}
  {/if}

  <LiveToasts />
</div>
