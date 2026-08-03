<script lang="ts">
  let { phase, state }: { phase: string; state?: string | null } = $props();

  const phaseColors: Record<string, string> = {
    scout: '#3b82f6',
    design: '#06b6d4',
    plan: '#8b5cf6',
    implement: '#f59e0b',
    verify: '#14b8a6',
    deploy: '#22c55e',
    done: '#22c55e',
    blocked: '#ef4444',
  };

  const stateColors: Record<string, string> = {
    entered: 'var(--factory-phase-entered)',
    done: 'var(--factory-phase-done)',
    blocked: 'var(--factory-phase-blocked)',
  };

  let bgColor = $derived(phaseColors[phase.toLowerCase()] ?? '#6b7280');
  let dotColor = $derived(state ? (stateColors[state] ?? 'var(--factory-phase-future)') : null);
</script>

<span
  class="phase-badge"
  style="--phase-bg: {bgColor}; --phase-dot: {dotColor};"
>
  {#if dotColor}<span class="phase-badge__dot"></span>{/if}
  {phase}
</span>

<style>
  .phase-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--factory-font-mono);
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--phase-bg) 20%, transparent);
    color: var(--phase-bg);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .phase-badge__dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--phase-dot);
    flex-shrink: 0;
  }
</style>
