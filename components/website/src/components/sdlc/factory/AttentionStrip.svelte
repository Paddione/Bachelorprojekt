<script lang="ts">
  import { onMount } from 'svelte';
  import type { AttentionPayload } from '../../../lib/factory-floor-types.ts';
  import { floorStore, acquireFloor } from '../../../lib/stores/factory-floor-store.ts';

  const EMPTY_ATTENTION: AttentionPayload = { blocked: [], stuck: [], cooldowns: [], isEmpty: true };

  // Z2-Hochzug (T007957/E3): liest payload.attention selbst aus dem floorStore.
  // Die attention-Prop bleibt als optionaler Override fuer Tests erhalten --
  // Default undefined -> Store gewinnt.
  let { attention }: { attention?: AttentionPayload } = $props();
  let attentionState = $state<AttentionPayload>(EMPTY_ATTENTION);

  onMount(() => {
    const release = acquireFloor();
    const unsub = floorStore.subscribe((s) => {
      if (s.payload) attentionState = s.payload.attention ?? EMPTY_ATTENTION;
    });
    return () => { unsub(); release(); };
  });

  const eff = $derived(attention ?? attentionState);
</script>

<!-- Wrapper wird IMMER gerendert (Requirement "persistent ... never covered"):
     expliziter Leerzustand statt komplett zu verschwinden. -->
<div class="attention" role="alert">
  {#if eff.isEmpty}
    <span class="attention-empty">Keine offenen Punkte</span>
  {:else}
    {#each eff.blocked as b}<span class="chip chip-blocked">⛔ {b.extId}: {b.reason}</span>{/each}
    {#each eff.stuck as s}<span class="chip chip-stuck">⏱ {s.extId} ({s.minutes}min)</span>{/each}
    {#each eff.cooldowns as c}<span class="chip chip-cool">🧊 {c.provider} Cooldown</span>{/each}
  {/if}
</div>
<style>
  .attention { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; background: oklch(0.62 0.20 25 / .08); border-bottom: 1px solid oklch(0.62 0.20 25 / .25); }
  .chip { font-size: 11px; font-family: var(--font-mono, monospace); padding: 2px 8px; border-radius: 4px; }
  .chip-blocked { background: oklch(0.62 0.20 25 / .18); color: oklch(0.72 0.18 25); }
  .chip-stuck { background: oklch(0.80 0.09 75 / .15); color: oklch(0.80 0.09 75); }
  .chip-cool { background: oklch(0.70 0.10 240 / .15); color: oklch(0.78 0.10 240); }
  .attention-empty { font-size: 11px; font-family: var(--font-mono, monospace); color: oklch(0.70 0 0 / .5); }
</style>
