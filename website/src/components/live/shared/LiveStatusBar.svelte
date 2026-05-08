<script lang="ts">
  import type { LiveCockpitData, LiveState } from '../../../lib/live-state';

  let { data, state }: { data: LiveCockpitData; state: LiveState } = $props();

  const dot = $derived(state === 'empty' ? 'bg-muted' : 'bg-red-500 animate-pulse');
  const label = $derived(
    state === 'empty' ? 'Bereit'
    : state === 'stream' ? 'ON AIR'
    : state === 'rooms' ? `${data.rooms.length} Call(s)`
    : `ON AIR · ${data.rooms.length} Call(s)`
  );
</script>

<div data-testid="live-status-bar" class="flex items-center gap-3 px-4 py-2 bg-dark-light border border-dark-lighter rounded-xl mb-4">
  <span class={`w-2.5 h-2.5 rounded-full ${dot}`}></span>
  <span class="text-sm font-mono text-light">{label}</span>
  {#if data.stream.recording}
    <span class="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-400/20">REC</span>
  {/if}
  {#if data.pollActive}
    <span class="text-xs px-1.5 py-0.5 rounded bg-gold/10 text-gold border border-gold/30">📊 Umfrage</span>
  {/if}
</div>
