<script lang="ts">
  import type { PhaseProgressSegment } from '../../lib/factory-floor-types';
  let { segments }: { segments: PhaseProgressSegment[] } = $props();
</script>
<div class="stepper" role="img" aria-label="Pipeline-Fortschritt">
  {#each segments as s (s.phase)}
    <span class="seg seg-{s.state}" title={`${s.phase}: ${s.state}`}></span>
  {/each}
</div>
<style>
  .stepper { display: flex; gap: 2px; }
  .seg { flex: 1; height: 4px; border-radius: 2px; background: var(--admin-border, #333); }
  .seg-done { background: oklch(0.80 0.06 160); }
  .seg-active { background: oklch(0.80 0.09 75); animation: pulse 2s infinite; }
  .seg-blocked { background: oklch(0.62 0.20 25); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
</style>
