<script lang="ts">
  interface Props {
    value: string | number;
    label: string;
    trend?: 'up' | 'down' | 'neutral' | null;
    color?: 'brass' | 'sage' | 'indigo' | 'danger' | 'neutral';
    href?: string;
    suffix?: string;
  }

  let {
    value,
    label,
    trend = null,
    color = 'neutral',
    href = '',
    suffix = '',
  }: Props = $props();

  const colorMap: Record<string, string> = {
    brass: 'var(--admin-primary)',
    sage: 'var(--admin-success)',
    indigo: 'var(--admin-info)',
    danger: 'var(--admin-danger)',
    neutral: 'var(--admin-border)',
  };

  const borderColor = $derived(colorMap[color] ?? colorMap.neutral);
</script>

{#if href}
  <a href={href} class="stat-card" style="--stat-accent: {borderColor};">
    <span class="stat-card__value">{value}</span>
    {#if suffix}
      <span class="stat-card__suffix">{suffix}</span>
    {/if}
    <span class="stat-card__label">{label}</span>
    {#if trend}
      <span class="stat-card__trend stat-card__trend--{trend}">
        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
      </span>
    {/if}
  </a>
{:else}
  <div class="stat-card" style="--stat-accent: {borderColor};">
    <span class="stat-card__value">{value}</span>
    {#if suffix}
      <span class="stat-card__suffix">{suffix}</span>
    {/if}
    <span class="stat-card__label">{label}</span>
    {#if trend}
      <span class="stat-card__trend stat-card__trend--{trend}">
        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
      </span>
    {/if}
  </div>
{/if}

<style>
  .stat-card {
    display: flex;
    flex-direction: column;
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-left: 3px solid var(--stat-accent);
    border-radius: var(--admin-card-radius);
    padding: var(--space-4);
    text-decoration: none;
    transition: border-color var(--admin-transition-fast);
  }

  a.stat-card:hover {
    border-color: var(--admin-border-bright);
  }

  .stat-card__value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--admin-text);
    line-height: 1.2;
  }

  .stat-card__suffix {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--admin-text);
    margin-top: 2px;
  }

  .stat-card__label {
    font-size: var(--admin-text-xs);
    color: var(--admin-text-mute);
    margin-top: var(--space-1);
  }

  .stat-card__trend {
    font-size: var(--admin-text-sm);
    margin-top: var(--space-1);
  }

  .stat-card__trend--up {
    color: var(--admin-success);
  }

  .stat-card__trend--down {
    color: var(--admin-danger);
  }

  .stat-card__trend--neutral {
    color: var(--admin-text-mute);
  }

  @media (max-width: 767px) {
    .stat-card {
      width: 100%;
      padding: 0.85rem 1rem;
    }
  }
</style>
