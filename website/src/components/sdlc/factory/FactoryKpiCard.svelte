<script lang="ts">
  let { icon, value, label, trend }: {
    icon: string;
    value: string | number;
    label: string;
    trend?: 'up' | 'down' | null;
  } = $props();
</script>

<div class="kpi-card">
  <div class="kpi-icon">
    {@html icon}
  </div>
  <div class="kpi-value">{value}</div>
  <div class="kpi-label">
    {label}
    {#if trend === 'up'}
      <span class="trend trend-up">▲</span>
    {:else if trend === 'down'}
      <span class="trend trend-down">▼</span>
    {/if}
  </div>
</div>

<style>
  .kpi-card {
    background: var(--factory-surface, #141414);
    border: 1px solid var(--factory-border, #2a2a2a);
    border-radius: var(--factory-radius-lg, 0.5rem);
    padding: var(--factory-spacing-md, 1rem);
    display: flex;
    flex-direction: column;
    gap: var(--factory-spacing-xs, 0.25rem);
    box-shadow: var(--factory-shadow-sm);
  }
  .kpi-icon {
    width: 24px;
    height: 24px;
    color: var(--factory-accent, #f59e0b);
  }
  .kpi-icon :global(svg) {
    width: 100%;
    height: 100%;
  }
  .kpi-value {
    font-family: var(--factory-font-mono);
    font-size: 32px;
    font-weight: 700;
    color: #ffffff;
    line-height: 1.1;
  }
  .kpi-label {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-xs, 0.75rem);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--factory-text-muted, #737373);
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .trend {
    font-size: 10px;
  }
  .trend-up {
    color: var(--factory-success, #10b981);
  }
  .trend-down {
    color: var(--factory-error, #ef4444);
  }
</style>
