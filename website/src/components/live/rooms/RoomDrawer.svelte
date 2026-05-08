<script lang="ts">
  import type { ActiveCallRoom } from '../../../lib/nextcloud-talk-db';

  let {
    room,
    onclose,
    transcribing = false,
    onStartTranscribe,
    onStopTranscribe,
  }: {
    room: ActiveCallRoom | null;
    onclose: () => void;
    transcribing?: boolean;
    onStartTranscribe?: (token: string) => Promise<void>;
    onStopTranscribe?: (token: string) => Promise<void>;
  } = $props();
</script>

{#if room}
  <div class="fixed inset-0 z-40 bg-black/60" onclick={onclose} role="presentation"></div>
  <aside data-testid="room-drawer" data-token={room.token}
         class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-dark-light border-l border-dark-lighter z-50 p-6 overflow-y-auto">
    <div class="flex justify-between items-start mb-4">
      <div>
        <h2 class="text-xl font-serif text-light">{room.displayName || room.name}</h2>
        <p class="text-xs text-muted font-mono mt-0.5">{room.token}</p>
      </div>
      <button onclick={onclose} aria-label="Schließen"
              class="text-muted hover:text-light text-2xl leading-none">×</button>
    </div>

    <section class="space-y-3">
      <h3 class="text-xs uppercase tracking-wide text-muted">Aktionen</h3>
      {#if transcribing}
        <button onclick={() => onStopTranscribe?.(room.token)}
                class="w-full px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-400/30 text-sm font-semibold">
          🎙 Transkription stoppen
        </button>
      {:else}
        <button onclick={() => onStartTranscribe?.(room.token)}
                class="w-full px-4 py-2 rounded-lg bg-gold text-dark text-sm font-semibold">
          🎙 Transkription starten
        </button>
      {/if}
    </section>
  </aside>
{/if}
