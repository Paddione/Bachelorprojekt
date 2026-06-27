<script lang="ts">
  import type { AttentionPayload } from '../../lib/factory-floor-types';
  let { attention }: { attention: AttentionPayload } = $props();
</script>
{#if !attention.isEmpty}
  <div class="attention" role="alert">
    {#each attention.blocked as b}<span class="chip chip-blocked">⛔ {b.extId}: {b.reason}</span>{/each}
    {#each attention.stuck as s}<span class="chip chip-stuck">⏱ {s.extId} ({s.minutes}min)</span>{/each}
    {#each attention.cooldowns as c}<span class="chip chip-cool">🧊 {c.provider} Cooldown</span>{/each}
  </div>
{/if}
<style>
  .attention { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; background: oklch(0.62 0.20 25 / .08); border-bottom: 1px solid oklch(0.62 0.20 25 / .25); }
  .chip { font-size: 11px; font-family: var(--font-mono, monospace); padding: 2px 8px; border-radius: 4px; }
  .chip-blocked { background: oklch(0.62 0.20 25 / .18); color: oklch(0.72 0.18 25); }
  .chip-stuck { background: oklch(0.80 0.09 75 / .15); color: oklch(0.80 0.09 75); }
  .chip-cool { background: oklch(0.70 0.10 240 / .15); color: oklch(0.78 0.10 240); }
</style>
