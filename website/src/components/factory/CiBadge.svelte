<script lang="ts">
  import type { CiRollup } from '../../lib/factory-ci';
  let { rollup }: { rollup: CiRollup } = $props();
  const label: Record<string, string> = { success: '✓ CI', pending: '… CI', failure: '✗ CI' };
</script>
{#if rollup}
  <span class="ci-badge ci-{rollup}">{label[rollup]}</span>
{/if}
<style>
  .ci-badge { font-size: 9px; font-family: var(--font-mono, monospace); padding: 0 4px; border-radius: 3px; }
  .ci-success { background: oklch(0.80 0.06 160 / .15); color: oklch(0.80 0.06 160); }
  .ci-pending { background: oklch(0.80 0.09 75 / .15); color: oklch(0.80 0.09 75); }
  .ci-failure { background: oklch(0.62 0.20 25 / .18); color: oklch(0.70 0.18 25); }
</style>
