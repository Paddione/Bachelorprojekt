<script lang="ts">
  import type { FactoryTicket } from './types';
  import type { HallItem } from '../../lib/factory-floor';

  let {
    ticket,
    item,
    compact = false,
    onClick,
  }: {
    ticket?: FactoryTicket;
    item?: HallItem;
    compact?: boolean;
    onClick?: () => void;
  } = $props();

  const priorityColors: Record<string, string> = {
    critical: 'var(--factory-priority-critical)',
    high: 'var(--factory-priority-high)',
    hoch: 'var(--factory-priority-critical)',
    medium: 'var(--factory-priority-medium)',
    mittel: 'var(--factory-priority-medium)',
    low: 'var(--factory-priority-low)',
    niedrig: 'var(--factory-priority-low)',
  };

  let displayId = $derived(item?.extId ?? ticket?.id ?? '');
  let displayTitle = $derived(item?.title ?? ticket?.title ?? '');
  let displayPriority = $derived(item?.priority ?? ticket?.priority ?? 'low');
  let borderColor = $derived(priorityColors[displayPriority] ?? 'var(--factory-priority-low)');
  let isBlocked = $derived(item?.phaseState === 'blocked');
  let isStuck = $derived.by(() => {
    if (!item?.phaseSince) return false;
    const mins = Math.floor((Date.now() - new Date(item.phaseSince).getTime()) / 60000);
    return mins >= 15 && !isBlocked;
  });
  let isDevflow = $derived(item?.driver === 'devflow');

  function ciIcon(s: 'success' | 'pending' | 'failure' | null): string {
    return s === 'success' ? '🟢' : s === 'failure' ? '🔴' : s === 'pending' ? '🟡' : '';
  }
</script>

<button
  type="button"
  class="workpiece-card"
  class:compact
  class:blocked={isBlocked}
  class:stuck={isStuck}
  style="--wp-border: {borderColor};"
  data-ticket-id={displayId}
  data-testid="floor-workpiece"
  data-driver={item?.driver ?? 'factory'}
  onclick={onClick}
>
  <div class="workpiece-card__header">
    <span class="workpiece-card__id">{displayId}</span>
    {#if item && isDevflow && item.ciStatus}
      <span class="workpiece-card__ci">{ciIcon(item.ciStatus)}</span>
    {:else}
      <span class="workpiece-card__priority">{displayPriority}</span>
    {/if}
  </div>
  <h3 class="workpiece-card__title">{displayTitle}</h3>
  {#if !compact && ticket}
    <div class="workpiece-card__meta">
      {#if ticket.phase}
        <span class="workpiece-card__phase">{ticket.phase}</span>
      {/if}
      {#if ticket.assignee}
        <span class="workpiece-card__assignee">{ticket.assignee}</span>
      {/if}
      {#if ticket.updatedAt}
        <time class="workpiece-card__time">{ticket.updatedAt}</time>
      {/if}
    </div>
  {/if}
  {#if item && isDevflow}
    <span class="workpiece-card__driver">👨‍💻</span>
  {/if}
</button>

<style>
  .workpiece-card {
    display: flex;
    flex-direction: column;
    background: var(--factory-surface);
    border: 1px solid var(--factory-border);
    border-left: 4px solid var(--wp-border);
    border-radius: var(--factory-radius-md);
    padding: var(--factory-spacing-sm) var(--factory-spacing-md);
    width: 160px;
    min-height: 80px;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
  }

  .workpiece-card:hover {
    background: var(--factory-surface-elevated);
    border-color: var(--factory-text-muted);
    border-left-color: var(--wp-border);
  }

  .workpiece-card.blocked {
    animation: ff-blocked-pulse 2s ease-in-out infinite;
    border-left-color: var(--factory-error);
  }

  .workpiece-card.stuck {
    border-left-color: var(--factory-accent);
    box-shadow: inset 0 0 0 1px var(--factory-accent);
  }

  .workpiece-card.compact {
    padding: var(--factory-spacing-xs) var(--factory-spacing-sm);
    width: auto;
    min-height: auto;
  }

  .workpiece-card__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--factory-spacing-xs);
  }

  .workpiece-card__id {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-xs);
    color: var(--factory-text-muted);
  }

  .workpiece-card__priority {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-xs);
    color: var(--wp-border);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .workpiece-card__ci {
    font-size: var(--factory-text-xs);
  }

  .workpiece-card__title {
    font-family: var(--factory-font-sans);
    font-size: var(--factory-text-sm);
    color: var(--factory-text-primary);
    margin: 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .workpiece-card__meta {
    display: flex;
    gap: var(--factory-spacing-sm);
    margin-top: var(--factory-spacing-sm);
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-xs);
    color: var(--factory-text-muted);
  }

  .workpiece-card__phase {
    background: var(--factory-surface-elevated);
    padding: 1px 6px;
    border-radius: var(--factory-radius-sm);
  }

  .workpiece-card__assignee::before {
    content: '@';
  }

  .workpiece-card__time {
    margin-left: auto;
  }

  .workpiece-card__driver {
    font-size: var(--factory-text-xs);
    margin-top: 2px;
  }
</style>
