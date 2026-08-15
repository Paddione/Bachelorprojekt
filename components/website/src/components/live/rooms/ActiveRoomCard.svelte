<script lang="ts">
  import type { ActiveCallRoom } from '../../../lib/nextcloud-talk-db';

  let {
    room,
    onclick,
    transcribing = false,
  }: {
    room: ActiveCallRoom;
    onclick?: () => void;
    transcribing?: boolean;
  } = $props();

  function durationLabel(activeSince: Date | null): string {
    if (!activeSince) return '—';
    const ms = Date.now() - new Date(activeSince).getTime();
    const min = Math.floor(ms / 60_000);
    if (min < 1) return '< 1 min';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}m`;
  }
</script>

<button
  type="button"
  data-testid="active-room-card"
  data-token={room.token}
  onclick={onclick}
  class="text-left bg-dark-light border border-dark-lighter rounded-xl px-4 py-3 hover:border-gold/40 transition-colors w-full"
>
  <div class="flex items-center justify-between mb-1">
    <span class="text-sm font-medium text-light truncate">{room.displayName || room.name || room.token}</span>
    {#if transcribing}
      <span class="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-400/20">📝</span>
    {/if}
  </div>
  <div class="text-xs text-muted">⏱ {durationLabel(room.activeSince)}</div>
</button>
