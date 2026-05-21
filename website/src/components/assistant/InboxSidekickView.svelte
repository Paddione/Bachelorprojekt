<!-- website/src/components/assistant/InboxSidekickView.svelte -->
<script lang="ts">
  type InboxType = 'registration' | 'booking' | 'contact' | 'bug' | 'meeting_finalize' | 'user_message';

  interface InboxItem {
    id: number;
    type: InboxType;
    payload: Record<string, unknown>;
    created_at: string;
  }

  let { onClose }: { onClose: () => void } = $props();

  let items = $state<InboxItem[]>([]);
  let loading = $state(true);
  let listError = $state('');
  let activeType = $state<InboxType | 'all'>('all');
  let actioning = $state<Record<number, boolean>>({});

  const TYPE_LABELS: Record<InboxType, string> = {
    registration: 'Anfragen',
    booking: 'Buchungen',
    contact: 'Kontakt',
    bug: 'Bugs',
    meeting_finalize: 'Meetings',
    user_message: 'Nachrichten',
  };

  // Dot colors matching type-meta.ts (hardcoded, no import needed)
  const DOT_COLORS: Record<InboxType, string> = {
    registration: 'oklch(0.86 0.09 75)',
    booking: 'oklch(0.86 0.06 160)',
    contact: '#8899aa',
    bug: 'oklch(0.85 0.1 25)',
    meeting_finalize: 'oklch(0.85 0.1 235)',
    user_message: 'oklch(0.85 0.1 290)',
  };

  // Types that support simple inline actions
  const SIMPLE_ACTIONS: Partial<Record<InboxType, string>> = {
    user_message: 'close_user_message',
    contact: 'archive_contact',
  };

  const ORDERED_TYPES: Array<{ id: InboxType; label: string }> = [
    { id: 'registration', label: 'Anfragen' },
    { id: 'booking', label: 'Buchungen' },
    { id: 'bug', label: 'Bugs' },
    { id: 'user_message', label: 'Nachrichten' },
    { id: 'meeting_finalize', label: 'Meetings' },
    { id: 'contact', label: 'Kontakt' },
  ];

  const displayed = $derived(
    (activeType === 'all' ? items : items.filter(i => i.type === activeType)).slice(0, 5)
  );

  async function load() {
    loading = true;
    listError = '';
    try {
      const r = await fetch('/api/admin/inbox?status=pending', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { items: InboxItem[] };
      items = j.items ?? [];
    } catch {
      listError = 'Postfach konnte nicht geladen werden.';
    } finally {
      loading = false;
    }
  }

  async function doAction(item: InboxItem, actionName: string) {
    actioning = { ...actioning, [item.id]: true };
    try {
      const r = await fetch(`/api/admin/inbox/${item.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: actionName }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Remove item from local list + fire badge sync event
      items = items.filter(i => i.id !== item.id);
      window.dispatchEvent(new CustomEvent('admin-inbox-changed'));
    } catch {
      // silently revert — item stays visible
    } finally {
      const next = { ...actioning };
      delete next[item.id];
      actioning = next;
    }
  }

  function senderLabel(item: InboxItem): string {
    const p = item.payload;
    if (typeof p.firstName === 'string' && typeof p.lastName === 'string') {
      return `${p.firstName} ${p.lastName}`;
    }
    if (typeof p.name === 'string') return p.name;
    if (typeof p.senderName === 'string') return p.senderName;
    if (typeof p.email === 'string') return p.email;
    return TYPE_LABELS[item.type];
  }

  function previewText(item: InboxItem): string {
    const p = item.payload;
    if (typeof p.message === 'string') return p.message;
    if (typeof p.description === 'string') return p.description;
    if (typeof p.typeLabel === 'string') return p.typeLabel;
    return '';
  }

  function relativeTime(dateStr: string): string {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'gerade eben';
    if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
    if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
    return `vor ${Math.floor(diff / 86400)} T.`;
  }

  $effect(() => { load(); });
</script>

<div class="view">
  <!-- Type filter pills -->
  <div class="pill-row">
    <button
      class="pill {activeType === 'all' ? 'active' : ''}"
      onclick={() => { activeType = 'all'; }}
    >Alle ({items.length})</button>
    {#each ORDERED_TYPES as t}
      {@const cnt = items.filter(i => i.type === t.id).length}
      {#if cnt > 0}
        <button
          class="pill {activeType === t.id ? 'active' : ''}"
          onclick={() => { activeType = t.id; }}
        >
          <span class="dot" style:background={DOT_COLORS[t.id]}></span>
          {t.label} ({cnt})
        </button>
      {/if}
    {/each}
  </div>

  <!-- Items -->
  <div class="items">
    {#if loading}
      {#each Array(3) as _}
        <div class="skeleton"></div>
      {/each}
    {:else if listError}
      <p class="err">{listError}</p>
    {:else if displayed.length === 0}
      <p class="empty">Keine ausstehenden Einträge.</p>
    {:else}
      {#each displayed as item (item.id)}
        <div class="item" class:fading={actioning[item.id]}>
          <div class="item-header">
            <span class="type-dot" style:background={DOT_COLORS[item.type]}></span>
            <span class="sender">{senderLabel(item)}</span>
            <span class="time">{relativeTime(item.created_at)}</span>
          </div>
          <p class="preview">{previewText(item) || TYPE_LABELS[item.type]}</p>
          <div class="item-actions">
            {#if SIMPLE_ACTIONS[item.type]}
              <button
                class="act-btn act-done"
                disabled={actioning[item.id]}
                onclick={() => doAction(item, SIMPLE_ACTIONS[item.type]!)}
              >✓ Erledigt</button>
            {:else}
              <a href="/admin/inbox" class="act-link">Im Postfach bearbeiten →</a>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Footer -->
  <a href="/admin/inbox" class="footer-link">Alle Nachrichten →</a>
</div>

<style>
  .view {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    padding-bottom: 60px;
  }

  .pill-row {
    display: flex;
    gap: 6px;
    padding: 12px 16px;
    overflow-x: auto;
    border-bottom: 1px solid rgba(232, 200, 112, 0.1);
    flex-shrink: 0;
  }
  .pill-row::-webkit-scrollbar { display: none; }

  .pill {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid #243049;
    background: transparent;
    color: #8899aa;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.12s, color 0.12s, background 0.12s;
    flex-shrink: 0;
  }
  .pill:hover { border-color: rgba(232,200,112,0.35); color: #c8d0e0; }
  .pill.active { background: #e8c870; color: #0f1623; border-color: #e8c870; font-weight: 700; }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .items {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
  }

  .item {
    background: #0f1623;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: opacity 0.25s;
  }
  .item.fading { opacity: 0.4; pointer-events: none; }
  .item:hover { border-color: rgba(232,200,112,0.2); }

  .item-header {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .type-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .sender {
    font-size: 12px;
    font-weight: 600;
    color: #c8d0e0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .time {
    font-size: 10px;
    color: #5566aa;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .preview {
    font-size: 11px;
    color: #6677aa;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.5;
  }

  .item-actions {
    display: flex;
    gap: 6px;
  }

  .act-btn {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 5px;
    border: 1px solid;
    cursor: pointer;
    transition: opacity 0.12s;
  }
  .act-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .act-done {
    background: rgba(34,197,94,0.1);
    color: #4ade80;
    border-color: rgba(34,197,94,0.25);
  }
  .act-done:not(:disabled):hover { background: rgba(34,197,94,0.18); }

  .act-link {
    font-size: 11px;
    font-weight: 600;
    color: #e8c870;
    text-decoration: none;
    padding: 4px 0;
  }
  .act-link:hover { text-decoration: underline; }

  .skeleton {
    height: 84px;
    background: linear-gradient(90deg, #1a2235 25%, #1e2a3f 50%, #1a2235 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 8px;
  }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  .empty { color: #5566aa; font-size: 12px; margin: 0; }
  .err { color: #f87171; font-size: 11px; margin: 0; }

  .footer-link {
    display: block;
    position: sticky;
    bottom: 0;
    padding: 12px 16px;
    background: #0f1623;
    border-top: 1px solid rgba(232, 200, 112, 0.1);
    font-size: 12px;
    font-weight: 600;
    color: #e8c870;
    text-decoration: none;
    text-align: right;
  }
  .footer-link:hover { text-decoration: underline; }
</style>
