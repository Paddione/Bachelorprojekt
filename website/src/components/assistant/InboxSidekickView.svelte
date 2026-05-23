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
  <!-- Intro -->
  <div class="iv-intro">
    <span class="iv-eyebrow">
      <span class="iv-eyebrow-bar" aria-hidden="true"></span>
      Postfach
    </span>
    <p class="iv-desc">Eingegangene Nachrichten, Buchungen und Anfragen an einem Ort.</p>
  </div>

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

  /* ── Intro ──────────────────────────────────────────────── */
  .iv-intro {
    padding: 24px 22px 16px;
    border-bottom: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .iv-eyebrow {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--brass);
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .iv-eyebrow-bar {
    width: 22px;
    height: 1px;
    background: currentColor;
    opacity: 0.8;
    flex-shrink: 0;
  }
  .iv-desc {
    margin: 0;
    font-size: 13px;
    color: var(--fg-soft);
    line-height: 1.55;
    max-width: 38ch;
  }

  /* ── Type filter pills ──────────────────────────────────── */
  .pill-row {
    display: flex;
    gap: 8px;
    padding: 14px 22px;
    overflow-x: auto;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
    -webkit-overflow-scrolling: touch;
  }
  .pill-row::-webkit-scrollbar { display: none; }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    min-height: 36px;
    border-radius: var(--radius-pill, 999px);
    border: 1px solid var(--line-2);
    background: transparent;
    color: var(--fg-soft);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 180ms ease, color 180ms ease, background 180ms ease;
    flex-shrink: 0;
  }
  .pill:hover {
    border-color: var(--brass-d);
    color: var(--fg);
  }
  .pill:focus-visible {
    outline: 2px solid var(--brass);
    outline-offset: 2px;
  }
  .pill.active {
    background: var(--brass);
    color: var(--ink-900);
    border-color: var(--brass);
    font-weight: 600;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* ── Items ──────────────────────────────────────────────── */
  .items {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 22px;
  }

  .item {
    background: var(--ink-800);
    border: 1px solid var(--line);
    border-radius: var(--radius-md, 12px);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: opacity 250ms ease, border-color 180ms ease, background 180ms ease;
    position: relative;
  }
  .item.fading { opacity: 0.4; pointer-events: none; }
  .item:hover {
    border-color: var(--brass-d);
    background: var(--ink-750);
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .type-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 0 3px var(--ink-800);
  }

  .sender {
    font-family: var(--serif);
    font-size: 16px;
    font-weight: 400;
    color: var(--fg);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: -0.01em;
  }

  .time {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--mute-2);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .preview {
    font-size: 13px;
    color: var(--fg-soft);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.5;
  }

  .item-actions {
    display: flex;
    gap: 8px;
    padding-top: 4px;
  }

  .act-btn {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 8px 14px;
    min-height: 36px;
    border-radius: var(--radius-pill, 999px);
    border: 1px solid;
    cursor: pointer;
    transition: opacity 120ms ease, background 180ms ease, border-color 180ms ease;
  }
  .act-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .act-done {
    background: oklch(0.80 0.06 160 / 0.1);
    color: var(--sage);
    border-color: oklch(0.80 0.06 160 / 0.35);
  }
  .act-done:not(:disabled):hover {
    background: oklch(0.80 0.06 160 / 0.18);
    border-color: var(--sage);
  }

  .act-link {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--brass);
    text-decoration: none;
    padding: 8px 0;
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    transition: color 180ms ease;
  }
  .act-link:hover { color: var(--brass-2); }

  .skeleton {
    height: 96px;
    background: linear-gradient(
      90deg,
      var(--ink-800) 25%,
      var(--ink-750) 50%,
      var(--ink-800) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: var(--radius-md, 12px);
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .empty {
    color: var(--mute);
    font-size: 13px;
    margin: 0;
    font-style: italic;
  }
  .err {
    color: oklch(0.62 0.18 22);
    font-size: 12px;
    margin: 0;
  }

  .footer-link {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    position: sticky;
    bottom: 0;
    padding: 14px 22px;
    background: linear-gradient(to top, var(--ink-900), var(--ink-900) 70%, transparent);
    border-top: 1px solid var(--line);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--brass);
    text-decoration: none;
    min-height: 44px;
    transition: color 180ms ease;
  }
  .footer-link:hover { color: var(--brass-2); }

  @media (max-width: 480px) {
    .iv-intro,
    .pill-row,
    .items { padding-inline: 18px; }
  }
</style>
