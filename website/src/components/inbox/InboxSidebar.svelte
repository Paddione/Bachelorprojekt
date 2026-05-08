<!-- website/src/components/inbox/InboxSidebar.svelte
     Type-filter rail. Shows "Alle" + 6 type rows with per-type counts.
     Counts are computed against the currently-loaded items, so they reflect
     the active status (pending / actioned / archived). -->
<script lang="ts">
  import type { InboxType } from '../../lib/messaging-db';
  import type { TypeMeta } from './type-meta';

  interface Props {
    types: ReadonlyArray<{ id: InboxType; label: string }>;
    counts: Record<string, number>;
    total: number;
    activeType: InboxType | 'all';
    typeMeta: Record<InboxType, TypeMeta>;
    onSelect: (type: InboxType | 'all') => void;
  }

  const { types, counts, total, activeType, typeMeta, onSelect }: Props = $props();
</script>

<aside class="sidebar" data-testid="inbox-sidebar">
  <p class="header">Filter</p>

  <ul class="list">
    <li>
      <button
        type="button"
        class="row {activeType === 'all' ? 'is-active' : ''}"
        data-testid="inbox-sidebar-item"
        data-type="all"
        data-selected={activeType === 'all'}
        onclick={() => onSelect('all')}
      >
        <span class="dot dot-all" aria-hidden="true"></span>
        <span class="label">Alle</span>
        <span class="count">{total}</span>
      </button>
    </li>

    {#each types as t (t.id)}
      {@const c = counts[t.id] ?? 0}
      <li>
        <button
          type="button"
          class="row {activeType === t.id ? 'is-active' : ''} {c === 0 ? 'is-empty' : ''}"
          data-testid="inbox-sidebar-item"
          data-type={t.id}
          data-selected={activeType === t.id}
          onclick={() => onSelect(t.id)}
        >
          <span
            class="dot"
            style:background={typeMeta[t.id].dotBg}
            aria-hidden="true"
          ></span>
          <span class="label">{t.label}</span>
          <span class="count">{c}</span>
        </button>
      </li>
    {/each}
  </ul>
</aside>

<style>
  .sidebar {
    width: 200px;
    flex-shrink: 0;
    background: var(--ink-850);
    border-right: 1px solid var(--line);
    overflow-y: auto;
    padding: 14px 8px 16px;
    box-sizing: border-box;
  }

  .header {
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 500;
    color: var(--mute-2);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin: 0 0 10px;
    padding: 0 10px;
  }

  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--fg-soft);
    font: 500 13px var(--font-sans);
    cursor: pointer;
    text-align: left;
    transition: background 0.1s ease, color 0.1s ease;
  }

  .row:hover { background: rgba(255, 255, 255, 0.025); color: var(--fg); }

  .row.is-active {
    background: oklch(0.80 0.09 75 / 0.14);
    color: var(--brass);
  }
  .row.is-active .count { color: var(--brass); }

  .row.is-empty:not(.is-active) { color: var(--mute-2); }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--brass);
  }
  .dot-all {
    background: linear-gradient(45deg, var(--brass) 0%, var(--sage) 100%);
  }

  .label { flex: 1; min-width: 0; }
  .count {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--mute);
    flex-shrink: 0;
  }

  @media (max-width: 767px) {
    .sidebar {
      width: 100%;
      border-right: none;
      border-bottom: 1px solid var(--line);
      overflow-y: visible;
      padding: 8px 8px 10px;
    }
    .header { display: none; }
    .list {
      flex-direction: row;
      gap: 6px;
      overflow-x: auto;
      scrollbar-width: thin;
      padding-bottom: 4px;
    }
    .list > li { flex-shrink: 0; }
    .row {
      padding: 6px 10px;
      gap: 6px;
      white-space: nowrap;
    }
  }
</style>
