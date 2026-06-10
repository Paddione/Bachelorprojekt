<script lang="ts">
  let { phase }: { phase: string } = $props();

  const phaseColors: Record<string, string> = {
    scout: '#3b82f6',
    plan: '#8b5cf6',
    implement: '#f59e0b',
    review: '#06b6d4',
    done: '#10b981',
    blocked: '#ef4444',
  };

  let bgColor = $derived(phaseColors[phase.toLowerCase()] ?? '#6b7280');
</script>

<span
  class="phase-badge"
  style="--pb-bg: {bgColor};"
>
  {phase}
</span>

<style>
  .phase-badge {
    display: inline-block;
    font-family: var(--factory-font-mono);
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--pb-bg) 20%, transparent);
    color: var(--pb-bg);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
</style>
