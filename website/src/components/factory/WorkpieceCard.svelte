<script lang="ts">
  import type { FactoryTicket } from './types';

  let {
    ticket,
    compact = false,
  }: {
    ticket: FactoryTicket;
    compact?: boolean;
  } = $props();

  const priorityColors: Record<FactoryTicket['priority'], string> = {
    critical: 'var(--factory-priority-critical)',
    high: 'var(--factory-priority-high)',
    medium: 'var(--factory-priority-medium)',
    low: 'var(--factory-priority-low)',
  };

  let borderColor = $derived(priorityColors[ticket.priority]);
</script>

<div
  class="workpiece-card"
  class:compact
  style="--wp-border: {borderColor};"
  data-ticket-id={ticket.id}
>
  <div class="workpiece-card__header">
    <span class="workpiece-card__id">{ticket.id}</span>
    <span class="workpiece-card__priority">{ticket.priority}</span>
  </div>
  <h3 class="workpiece-card__title">{ticket.title}</h3>
  {#if !compact}
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
</div>

<style>
  .workpiece-card {
    background: var(--factory-surface);
    border: 1px solid var(--factory-border);
    border-left: 4px solid var(--wp-border);
    border-radius: var(--factory-radius-md);
    padding: var(--factory-spacing-md);
    transition: background 0.15s, border-color 0.15s;
    cursor: default;
  }

  .workpiece-card:hover {
    background: var(--factory-surface-elevated);
    border-color: var(--factory-text-muted);
    border-left-color: var(--wp-border);
  }

  .workpiece-card.compact {
    padding: var(--factory-spacing-sm) var(--factory-spacing-md);
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

  .workpiece-card__title {
    font-family: var(--factory-font-sans);
    font-size: var(--factory-text-sm);
    color: var(--factory-text-primary);
    margin: 0;
    line-height: 1.4;
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
</style>
