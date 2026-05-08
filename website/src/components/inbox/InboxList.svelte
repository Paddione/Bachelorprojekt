<!-- website/src/components/inbox/InboxList.svelte
     The middle column: search box + scrollable list of items. Selection
     state is owned by the parent; this component only emits onSelect. -->
<script lang="ts">
  import type { InboxItem, InboxStatus } from '../../lib/messaging-db';
  import { TYPE_META } from './type-meta';
  import { canQuickDone as _canQuickDone } from './inbox-actions';

  interface Props {
    items: InboxItem[];
    selectedId: number | null;
    searchQuery: string;
    activeStatus: InboxStatus;
    busy: boolean;
    onSelect: (id: number) => void;
    onSearch: (q: string) => void;
    onQuickDone?: (id: number) => void;
    bindSearchInput?: (el: HTMLInputElement | null) => void;
  }

  const {
    items,
    selectedId,
    searchQuery,
    activeStatus,
    busy,
    onSelect,
    onSearch,
    onQuickDone,
    bindSearchInput,
  }: Props = $props();

  // Inline check-icon ("Erledigt") is only shown for pending items where the
  // primary action does not need additional input. Bugs require a resolution
  // note (entered in the detail pane) — handled there.
  function canQuickDone(item: InboxItem): boolean {
    return _canQuickDone(item.type, activeStatus);
  }

  let searchEl: HTMLInputElement | null = $state(null);

  $effect(() => {
    bindSearchInput?.(searchEl);
    return () => bindSearchInput?.(null);
  });

  function summary(item: InboxItem): { name: string; sub: string } {
    const p = (item.payload ?? {}) as Record<string, unknown>;
    const s = (k: string): string => {
      const v = p[k];
      return typeof v === 'string' ? v : '';
    };
    switch (item.type) {
      case 'registration': {
        const first = s('firstName'), last = s('lastName');
        const name = [first, last].filter(Boolean).join(' ').trim() || s('email') || 'Anfrage';
        const sub  = s('email') + (s('company') ? ` · ${s('company')}` : '');
        return { name, sub: sub.trim() || '—' };
      }
      case 'booking': {
        const name = s('name') || 'Buchung';
        const sub  = [s('typeLabel'), s('slotDisplay')].filter(Boolean).join(' · ');
        return { name, sub: sub || '—' };
      }
      case 'contact': {
        const name = s('name') || s('email') || 'Kontakt';
        const sub  = s('subject') || s('message') || '—';
        return { name, sub };
      }
      case 'bug': {
        const name = s('ticketId') || `Bug #${item.id}`;
        return { name, sub: s('description') || '—' };
      }
      case 'meeting_finalize': {
        const name = s('customerName') || 'Meeting';
        const sub  = [s('meetingType'), s('meetingDate')].filter(Boolean).join(' · ');
        return { name, sub: sub || '—' };
      }
      case 'user_message': {
        const name = s('senderName') || 'Nutzer';
        return { name, sub: s('message') || '—' };
      }
      default:
        return { name: item.type, sub: '' };
    }
  }

  function relative(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (sec < 60)        return 'gerade eben';
    const m = Math.floor(sec / 60);
    if (m < 60)          return `vor ${m} Min`;
    const h = Math.floor(m / 60);
    if (h < 24)          return `vor ${h} Std`;
    const days = Math.floor(h / 24);
    if (days < 30)       return `vor ${days} T`;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }
</script>

<section class="list-pane" data-testid="inbox-list">
  <div class="search-row">
    <input
      type="text"
      bind:this={searchEl}
      class="search"
      data-testid="inbox-search"
      placeholder="Suchen…"
      value={searchQuery}
      oninput={(e) => onSearch(e.currentTarget.value)}
      aria-label="Posteingang durchsuchen"
    />
  </div>

  <div class="rows" role="listbox" aria-label="Posteingang">
    {#if items.length === 0}
      <p class="empty">Keine Einträge.</p>
    {:else}
      {#each items as item (item.id)}
        {@const meta = TYPE_META[item.type]}
        {@const sum = summary(item)}
        {@const isSelected = item.id === selectedId}
        {@const showQuickDone = canQuickDone(item) && !!onQuickDone}
        <div class="row-wrap {isSelected ? 'is-selected' : ''} {showQuickDone ? 'has-quick' : ''}">
          <button
            type="button"
            class="row"
            data-testid="inbox-list-row"
            data-id={item.id}
            data-type={item.type}
            data-selected={isSelected}
            aria-selected={isSelected}
            role="option"
            onclick={() => onSelect(item.id)}
          >
            <div class="row-top">
              <span class="row-name" title={sum.name}>{sum.name}</span>
              <time class="row-time">{relative(item.created_at)}</time>
            </div>
            <div class="row-bottom">
              <span
                class="pill"
                style:background={meta.pillBg}
                style:color={meta.pillFg}
              >{meta.label}</span>
              <span class="row-sub" title={sum.sub}>{sum.sub}</span>
            </div>
          </button>
          {#if showQuickDone}
            <button
              type="button"
              class="row-quick"
              data-testid="inbox-list-row-done"
              data-id={item.id}
              aria-label="Erledigt"
              title="Erledigt"
              disabled={busy}
              onclick={(e) => { e.stopPropagation(); onQuickDone?.(item.id); }}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                   aria-hidden="true">
                <path d="M3 8.5l3 3 7-7" />
              </svg>
            </button>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  .list-pane {
    width: 340px;
    flex-shrink: 0;
    background: var(--ink-900);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    min-height: 0;
    box-sizing: border-box;
  }

  .search-row {
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
    background: var(--ink-900);
    flex-shrink: 0;
  }

  .search {
    width: 100%;
    box-sizing: border-box;
    background: var(--ink-850);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--fg);
    font: 400 12px var(--font-sans);
    padding: 7px 10px;
    outline: none;
  }
  .search::placeholder { color: var(--mute-2); }
  .search:focus { border-color: var(--brass); }

  .rows {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .empty {
    text-align: center;
    color: var(--mute);
    margin: 32px 16px;
    font-size: 12px;
  }

  .row-wrap {
    position: relative;
  }

  .row {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 14px 11px;
    background: transparent;
    border: none;
    border-left: 2px solid transparent;
    border-bottom: 1px solid var(--line);
    color: var(--fg);
    text-align: left;
    cursor: pointer;
    transition: background 0.1s ease;
  }
  .row:hover { background: rgba(255, 255, 255, 0.025); }
  .row[data-selected="true"] {
    background: oklch(0.80 0.09 75 / 0.07);
    border-left-color: var(--brass);
  }
  .row-wrap.has-quick .row { padding-right: 44px; }

  .row-quick {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    width: 26px;
    height: 26px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--line-2);
    border-radius: 6px;
    color: var(--mute);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
    opacity: 0;
  }
  .row-wrap:hover .row-quick,
  .row-wrap:focus-within .row-quick,
  .row-wrap.is-selected .row-quick,
  .row:focus-visible ~ .row-quick {
    opacity: 1;
  }
  .row-quick:hover:not(:disabled) {
    background: oklch(0.80 0.06 160 / 0.18);
    color: oklch(0.86 0.06 160);
    border-color: oklch(0.80 0.06 160 / 0.55);
  }
  .row-quick:disabled { opacity: 0.4; cursor: not-allowed; }
  .row-quick svg { width: 14px; height: 14px; }

  /* Touch devices: always show the button so users without hover can tap it. */
  @media (hover: none) {
    .row-quick { opacity: 1; }
  }

  .row-top {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .row-name {
    flex: 1;
    min-width: 0;
    font: 500 12px var(--font-sans);
    color: var(--fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-time {
    flex-shrink: 0;
    font: 400 10.5px var(--font-mono);
    color: var(--mute);
  }

  .row-bottom {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .pill {
    flex-shrink: 0;
    font: 600 10px var(--font-mono);
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .row-sub {
    flex: 1;
    min-width: 0;
    font: 400 11.5px var(--font-sans);
    color: var(--mute);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 767px) {
    .list-pane { width: 100%; border-right: none; }
  }
</style>
