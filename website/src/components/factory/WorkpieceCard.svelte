<script lang="ts">
  import type { FactoryTicket } from './types';
  import type { HallItem } from '../../lib/factory-floor-types';

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

  // priority → edge strip colour + optional glow
  const PRIO_EDGE: Record<string, { color: string; glow: string }> = {
    kritisch: { color: 'var(--danger)',   glow: '0 0 10px -1px color-mix(in oklab, var(--danger) 70%, transparent)' },
    hoch:     { color: 'var(--brass)',    glow: '0 0 10px -2px color-mix(in oklab, var(--brass) 60%, transparent)' },
    mittel:   { color: 'color-mix(in oklab, var(--brass) 55%, var(--mute-2))', glow: 'none' },
    niedrig:  { color: 'var(--mute-2)',   glow: 'none' },
    high:     { color: 'var(--brass)',    glow: '0 0 10px -2px color-mix(in oklab, var(--brass) 60%, transparent)' },
    medium:   { color: 'color-mix(in oklab, var(--brass) 55%, var(--mute-2))', glow: 'none' },
    low:      { color: 'var(--mute-2)',   glow: 'none' },
    critical: { color: 'var(--danger)',   glow: '0 0 10px -1px color-mix(in oklab, var(--danger) 70%, transparent)' },
  };

  const PRIO_LABEL: Record<string, string> = {
    kritisch: 'Kritisch', hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig',
    critical: 'Kritisch', high: 'Hoch', medium: 'Mittel', low: 'Niedrig',
  };

  let displayId    = $derived(item?.extId ?? ticket?.id ?? '');
  let displayTitle = $derived(item?.title ?? ticket?.title ?? '');
  let displayPrio  = $derived((item?.priority ?? ticket?.priority ?? 'low').toLowerCase());
  let isBlocked    = $derived(item?.phaseState === 'blocked');
  let isDevflow    = $derived(item?.driver === 'devflow');
  let edgeStyle    = $derived(PRIO_EDGE[displayPrio] ?? PRIO_EDGE.low);
  let prioLabel    = $derived(PRIO_LABEL[displayPrio] ?? displayPrio);

  let elapsedText = $derived.by(() => {
    if (!item?.phaseSince) return '';
    const m = Math.floor((Date.now() - new Date(item.phaseSince).getTime()) / 60000);
    if (m < 60) return `${m} Min.`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} Min.` : `${h} h`;
  });

  function ciIcon(s: 'success' | 'pending' | 'failure' | null): string {
    return s === 'success' ? '🟢' : s === 'failure' ? '🔴' : s === 'pending' ? '🟡' : '';
  }
</script>

<button
  type="button"
  class="wp"
  class:wp--blocked={isBlocked}
  class:wp--compact={compact}
  data-ticket-id={displayId}
  data-testid="floor-workpiece"
  data-driver={item?.driver ?? 'factory'}
  onclick={onClick}
  style="--edge-color:{edgeStyle.color}; --edge-glow:{edgeStyle.glow};"
>
  <!-- priority edge strip -->
  <span class="wp-edge"></span>

  <!-- card body -->
  <span class="wp-body">
    <!-- row 1: id + status -->
    <span class="wp-header">
      <span class="wp-id">{displayId}</span>
      <span class="wp-badge">
        {#if isBlocked}
          <span class="wp-pill wp-pill--danger">⛔ Blockiert</span>
        {:else if isDevflow && item?.ciStatus}
          <span class="wp-ci">{ciIcon(item.ciStatus)}</span>
        {:else}
          <span class="wp-live-dot"></span>
        {/if}
      </span>
    </span>

    <!-- row 2: title (serif) -->
    <span class="wp-title">{displayTitle}</span>

    <!-- row 3: prio label + elapsed -->
    <span class="wp-footer">
      {#if isDevflow}
        <span class="wp-meta">👨‍💻 devflow</span>
      {:else}
        <span class="wp-meta">{prioLabel.toUpperCase()}</span>
      {/if}
      {#if elapsedText}
        <span class="wp-time" class:wp-time--alert={isBlocked}>{elapsedText}</span>
      {/if}
    </span>
  </span>
</button>

<style>
  .wp {
    display: flex;
    align-items: stretch;
    width: 100%;
    padding: 0;
    background: var(--ink-850);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
    overflow: hidden;
    transition:
      border-color var(--dur-base) var(--ease-soft),
      transform    var(--dur-base) var(--ease-soft),
      background   var(--dur-base) var(--ease-soft);
  }

  .wp:hover {
    border-color: color-mix(in oklab, var(--brass) 50%, var(--line-2));
    transform: translateY(-2px);
    background: var(--ink-800);
  }

  .wp--blocked {
    border-color: color-mix(in oklab, var(--danger) 32%, var(--line));
    animation: ff-blocked-pulse 2s ease-in-out infinite;
  }

  .wp--compact .wp-body { padding: 8px 10px; }
  .wp--compact .wp-title { font-size: 13px; -webkit-line-clamp: 1; }

  /* priority edge strip */
  .wp-edge {
    width: 3px;
    flex: none;
    align-self: stretch;
    background: var(--edge-color);
    box-shadow: var(--edge-glow);
    border-radius: var(--radius-md) 0 0 var(--radius-md);
  }

  /* card body */
  .wp-body {
    flex: 1;
    padding: 13px 14px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .wp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 9px;
  }

  .wp-id {
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--mute);
    letter-spacing: .06em;
  }

  .wp-badge {
    display: inline-flex;
    align-items: center;
  }

  /* live pulse dot */
  .wp-live-dot {
    position: relative;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--sage);
    flex: none;
  }
  .wp-live-dot::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--sage);
    animation: ff-pulse-ring 2.2s var(--ease-soft) infinite;
  }

  /* danger pill */
  .wp-pill {
    display: inline-flex;
    align-items: center;
    font-family: var(--mono);
    font-size: 9.5px;
    letter-spacing: .08em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: var(--radius-pill);
  }
  .wp-pill--danger {
    color: var(--danger);
    background: color-mix(in oklab, var(--danger) 12%, transparent);
    border: 1px solid color-mix(in oklab, var(--danger) 45%, transparent);
  }

  /* title in serif */
  .wp-title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-family: var(--serif);
    font-size: 15px;
    font-weight: 400;
    line-height: 1.25;
    color: var(--fg);
    letter-spacing: -.01em;
    margin-bottom: 10px;
  }

  .wp-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .wp-meta {
    font-family: var(--mono);
    font-size: 9.5px;
    color: var(--mute-2);
    letter-spacing: .1em;
    text-transform: uppercase;
  }

  .wp-ci {
    font-size: 10px;
  }

  .wp-time {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--mute);
  }
  .wp-time--alert { color: var(--danger); }
</style>
