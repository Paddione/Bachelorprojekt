<!-- website/src/components/inbox/InboxApp.svelte
     Orchestrator for the admin inbox: owns state, fetches, keyboard handlers
     and the top status bar. Delegates rendering to Sidebar / List / Detail. -->
<script lang="ts">
  import type { InboxItem, InboxType, InboxStatus, Message } from '../../lib/messaging-db';
  import InboxSidebar from './InboxSidebar.svelte';
  import InboxList    from './InboxList.svelte';
  import InboxDetail  from './InboxDetail.svelte';
  import { TYPE_META, TYPE_ORDER } from './type-meta';
  import { handle as handleShortcut } from './inbox-shortcuts';
  import { primaryActionFor } from './inbox-actions';

  interface Props {
    initialItems: InboxItem[];
    initialCounts: Record<string, number>;
  }

  const { initialItems, initialCounts }: Props = $props();

  // ── State ────────────────────────────────────────────────────────────────
  let items   = $state<InboxItem[]>(initialItems);
  let counts  = $state<Record<string, number>>(initialCounts);

  let activeStatus = $state<InboxStatus>('pending');
  let activeType   = $state<InboxType | 'all'>('all');
  let searchQuery  = $state('');

  let selectedId   = $state<number | null>(initialItems[0]?.id ?? null);

  let busy            = $state(false);
  let actionError     = $state<string | null>(null);
  let threadMessages  = $state<Message[]>([]);
  let threadLoading   = $state(false);
  let replyBody       = $state('');
  let replySending    = $state(false);
  let bugNote         = $state('');

  let mobileView = $state<'list' | 'detail'>('list');

  // refs into children
  let searchInput: HTMLInputElement | null = $state(null);
  let replyTextarea: HTMLTextAreaElement | null = $state(null);
  let awaitingG = false;
  let pointerFine = $state(true);

  // ── Derived ──────────────────────────────────────────────────────────────
  const visible = $derived(items
    .filter(i => activeType === 'all' || i.type === activeType)
    .filter(i => searchQuery.trim() === '' || matchesSearch(i, searchQuery)));

  const selected = $derived(visible.find(i => i.id === selectedId) ?? null);

  const typeCounts = $derived.by((): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const it of items) out[it.type] = (out[it.type] ?? 0) + 1;
    return out;
  });

  const visibleTotal = $derived(visible.length);

  const pendingTotal = $derived(Object.values(counts).reduce((a, b) => a + b, 0));

  // Keep the AdminLayout sidebar badge in sync with the local counts. We dispatch
  // a CustomEvent that the layout's inline script listens for; falling back to a
  // direct call if the global helper has been registered already. Running inside
  // an $effect ensures the badge updates reactively whenever counts change —
  // including after reload(), postAction(), or initial mount.
  $effect(() => {
    const total = pendingTotal;
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(new CustomEvent('admin-inbox-changed', { detail: { total, counts } }));
    } catch {
      const fn = (window as unknown as { setAdminInboxBadgeCount?: (n: number) => void }).setAdminInboxBadgeCount;
      if (typeof fn === 'function') fn(total);
    }
  });

  // ── Effects ──────────────────────────────────────────────────────────────

  // Whenever the visible list changes, ensure selectedId is still in it.
  $effect(() => {
    if (visible.length === 0) {
      if (selectedId !== null) selectedId = null;
      return;
    }
    if (selectedId === null || !visible.some(i => i.id === selectedId)) {
      selectedId = visible[0].id;
    }
  });

  // Detect pointer capability for the keyboard guard.
  $effect(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try { pointerFine = window.matchMedia('(pointer: fine)').matches; }
      catch { pointerFine = true; }
    }
  });

  // When the selected item changes, hydrate type-specific async state.
  $effect(() => {
    actionError = null;
    if (!selected) {
      threadMessages = [];
      replyBody = '';
      bugNote = '';
      return;
    }
    // user_message thread
    if (selected.type === 'user_message') {
      const threadId = selected.reference_id;
      if (threadId) {
        threadLoading = true;
        threadMessages = [];
        fetch(`/api/admin/messages/${threadId}`)
          .then(r => r.ok ? r.json() as Promise<{ messages: Message[] }> : { messages: [] })
          .then(data => { threadMessages = data.messages ?? []; })
          .catch(() => { threadMessages = []; })
          .finally(() => { threadLoading = false; });
      } else {
        threadMessages = [];
      }
      replyBody = '';
    } else {
      threadMessages = [];
    }
    // bug note: hydrate from localStorage so navigating away doesn't lose work
    if (selected.type === 'bug') {
      const k = `inbox-bug-note-${selected.id}`;
      try {
        const v = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
        bugNote = v ?? '';
      } catch { bugNote = ''; }
    } else {
      bugNote = '';
    }
  });

  // Persist bug note as the user types.
  $effect(() => {
    if (selected?.type !== 'bug') return;
    const k = `inbox-bug-note-${selected.id}`;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(k, bugNote); }
    catch { /* ignore quota errors */ }
  });

  // Global keyboard handler (desktop only).
  $effect(() => {
    if (typeof window === 'undefined') return;
    function onKey(e: KeyboardEvent) {
      const r = handleShortcut({
        event: e,
        ctx: { selectedType: selected?.type ?? null, awaitingG, pointerFine },
      });
      awaitingG = r.awaitingG;
      if (!r.action) return;
      if (r.preventDefault) e.preventDefault();
      dispatch(r.action);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  function matchesSearch(i: InboxItem, q: string): boolean {
    const haystack = JSON.stringify(i.payload ?? {}).toLowerCase()
      + ' ' + (i.bug_ticket_id ?? '').toLowerCase()
      + ' ' + (i.reference_id ?? '').toLowerCase()
      + ' ' + i.type;
    return haystack.includes(q.toLowerCase());
  }

  function dispatch(action: ReturnType<typeof handleShortcut>['action']): void {
    if (!action) return;
    switch (action.kind) {
      case 'select-next': moveSelection(+1); break;
      case 'select-prev': moveSelection(-1); break;
      case 'set-type':    setType(action.type); break;
      case 'set-status':  setStatus(action.status); break;
      case 'focus-search': searchInput?.focus(); searchInput?.select(); break;
      case 'focus-reply':  replyTextarea?.focus(); break;
      case 'send-reply':   void sendReply(); break;
      case 'clear':
        if (searchQuery) searchQuery = '';
        else if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        break;
      case 'action':
        if (action.name === 'primary') void runPrimary();
        else void runSecondary();
        break;
      case 'toggle-help':
        // Cheat-sheet popover not in the spec scope; no-op for now.
        break;
    }
  }

  function moveSelection(delta: number): void {
    if (visible.length === 0) return;
    const idx = visible.findIndex(i => i.id === selectedId);
    const next = idx === -1 ? 0 : Math.min(visible.length - 1, Math.max(0, idx + delta));
    selectedId = visible[next].id;
  }

  function setStatus(s: InboxStatus): void {
    if (s === activeStatus) return;
    activeStatus = s;
    void reload();
  }

  function setType(t: InboxType | 'all'): void {
    activeType = t;
    selectedId = null; // $effect resets to first visible
  }

  async function reload(): Promise<void> {
    try {
      const p = new URLSearchParams({ status: activeStatus });
      const res = await fetch(`/api/admin/inbox?${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { items: InboxItem[]; counts: Record<string, number> };
      items = data.items ?? [];
      counts = data.counts ?? {};
      selectedId = null;
    } catch (err) {
      console.error('[InboxApp] reload failed:', err);
    }
  }

  async function postAction(item: InboxItem, action: string, note?: string): Promise<boolean> {
    busy = true;
    actionError = null;
    try {
      const res = await fetch(`/api/admin/inbox/${item.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      });
      // 204 No Content (used by `delete`) returns no JSON body — guard the parse.
      const data = res.status === 204
        ? {}
        : (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        actionError = (data as { error?: string }).error ?? `Fehler (${res.status})`;
        return false;
      }
      // remove the actioned item, advance selection, decrement count
      const idx = visible.findIndex(i => i.id === item.id);
      items = items.filter(i => i.id !== item.id);
      if (activeStatus === 'pending') {
        counts = { ...counts, [item.type]: Math.max(0, (counts[item.type] ?? 1) - 1) };
      }
      // pick the next visible item below, else previous, else null
      const newVisible = items
        .filter(i => activeType === 'all' || i.type === activeType)
        .filter(i => searchQuery.trim() === '' || matchesSearch(i, searchQuery));
      if (newVisible.length === 0) {
        selectedId = null;
        if (mobileView === 'detail') mobileView = 'list';
      } else {
        const newIdx = Math.min(idx, newVisible.length - 1);
        selectedId = newVisible[Math.max(0, newIdx)].id;
      }
      // clear bug note locally
      if (item.type === 'bug') {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(`inbox-bug-note-${item.id}`);
          }
        } catch { /* ignore */ }
      }
      return true;
    } catch {
      actionError = 'Netzwerkfehler';
      return false;
    } finally {
      busy = false;
    }
  }

  async function runPrimary(): Promise<void> {
    const it = selected;
    if (!it || busy) return;
    switch (it.type) {
      case 'registration':     await postAction(it, 'approve_registration'); break;
      case 'booking':          await postAction(it, 'approve_booking');      break;
      case 'contact':          await postAction(it, 'archive_contact');     break;
      case 'bug':
        if (!bugNote.trim()) { actionError = 'Bitte Notiz eingeben.'; return; }
        await postAction(it, 'resolve_bug', bugNote.trim());
        break;
      case 'meeting_finalize': await postAction(it, 'finalize_meeting');     break;
      case 'user_message':     await postAction(it, 'close_user_message');   break;
    }
  }

  // Quick "Erledigt" action invoked from a row's inline check button. Skips
  // bug-type items because their resolve action requires a note (entered in
  // the detail pane). Does not require the row to be selected first.
  async function quickDone(id: number): Promise<void> {
    if (busy) return;
    const it = items.find(i => i.id === id);
    if (!it) return;
    const action = primaryActionFor(it.type);
    if (!action) return; // 'bug' or unknown — must use detail pane
    await postAction(it, action);
  }

  async function runSecondary(): Promise<void> {
    const it = selected;
    if (!it || busy) return;
    if (it.type === 'registration') await postAction(it, 'decline_registration');
    else if (it.type === 'booking') await postAction(it, 'decline_booking');
  }

  // Hard-delete escape hatch. Visible on EVERY row regardless of status
  // (pending/actioned/archived) so admins can clear rows that have no
  // other path off the queue — e.g. an `archived` contact, an `actioned`
  // booking that was already cleaned up, or a stale [TEST] item from a
  // pre-purge regression. Confirms via window.confirm() before firing.
  async function deleteItem(): Promise<void> {
    const it = selected;
    if (!it || busy) return;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const ok = window.confirm('Diesen Eintrag dauerhaft löschen? Die Aktion kann nicht rückgängig gemacht werden.');
      if (!ok) return;
    }
    await postAction(it, 'delete');
  }

  async function sendReply(): Promise<void> {
    const it = selected;
    if (!it || it.type !== 'user_message' || !it.reference_id) return;
    const body = replyBody.trim();
    if (!body || replySending) return;
    replySending = true;
    try {
      const res = await fetch(`/api/admin/messages/${it.reference_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const data = await res.json() as { message: Message };
        threadMessages = [...threadMessages, data.message];
        replyBody = '';
      }
    } finally {
      replySending = false;
    }
  }

  function selectItem(id: number): void {
    selectedId = id;
    mobileView = 'detail';
  }
</script>

<div class="inbox-app" data-testid="inbox-app">

  <!-- Top status bar -->
  <header class="topbar">
    <div class="crumb">Admin · Posteingang</div>

    <div class="status-tabs" role="tablist" aria-label="Status filter">
      <button
        type="button"
        role="tab"
        class="tab {activeStatus === 'pending' ? 'is-active' : ''}"
        data-testid="inbox-status-tab"
        data-status="pending"
        aria-selected={activeStatus === 'pending'}
        onclick={() => setStatus('pending')}
      >Offen <span class="tab-count">{pendingTotal}</span></button>
      <button
        type="button"
        role="tab"
        class="tab {activeStatus === 'actioned' ? 'is-active' : ''}"
        data-testid="inbox-status-tab"
        data-status="actioned"
        aria-selected={activeStatus === 'actioned'}
        onclick={() => setStatus('actioned')}
      >Erledigt</button>
      <button
        type="button"
        role="tab"
        class="tab {activeStatus === 'archived' ? 'is-active' : ''}"
        data-testid="inbox-status-tab"
        data-status="archived"
        aria-selected={activeStatus === 'archived'}
        onclick={() => setStatus('archived')}
      >Archiv</button>
    </div>

    <div class="search-hint" aria-hidden="true">
      <span class="ksk">/</span>
      <span>Suchen</span>
    </div>
  </header>

  <!-- Three columns -->
  <div class="cols" data-mobile-view={mobileView}>
    <div class="col col-sidebar">
      <InboxSidebar
        types={TYPE_ORDER}
        counts={typeCounts}
        total={items.length}
        activeType={activeType}
        typeMeta={TYPE_META}
        onSelect={setType}
      />
    </div>

    <div class="col col-list">
      <div class="mobile-back-row">
        <span class="mobile-status-line">{visibleTotal} {visibleTotal === 1 ? 'Eintrag' : 'Einträge'}</span>
      </div>
      <InboxList
        items={visible}
        selectedId={selectedId}
        searchQuery={searchQuery}
        activeStatus={activeStatus}
        busy={busy}
        onSelect={selectItem}
        onSearch={(q) => { searchQuery = q; }}
        onQuickDone={(id) => { void quickDone(id); }}
        bindSearchInput={(el) => { searchInput = el; }}
      />
    </div>

    <div class="col col-detail">
      {#if mobileView === 'detail'}
        <button
          type="button"
          class="mobile-back"
          aria-label="Zurück zur Liste"
          onclick={() => { mobileView = 'list'; }}
        >← Zurück</button>
      {/if}
      <InboxDetail
        item={selected}
        counts={counts}
        busy={busy}
        error={actionError}
        threadMessages={threadMessages}
        threadLoading={threadLoading}
        replyBody={replyBody}
        replySending={replySending}
        bugNote={bugNote}
        bindReplyTextarea={(el) => { replyTextarea = el; }}
        onPrev={() => moveSelection(-1)}
        onNext={() => moveSelection(+1)}
        onPrimary={runPrimary}
        onSecondary={runSecondary}
        onDelete={deleteItem}
        onReplyChange={(v) => { replyBody = v; }}
        onSendReply={sendReply}
        onBugNoteChange={(v) => { bugNote = v; }}
      />
    </div>
  </div>
</div>

<style>
  .inbox-app {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--ink-900);
    color: var(--fg);
    border-radius: 10px;
    border: 1px solid var(--line);
    overflow: hidden;
    font-family: var(--font-sans);
  }

  .topbar {
    height: 44px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    border-bottom: 1px solid var(--line);
    background: var(--ink-850);
  }

  .crumb {
    font: 500 13px var(--font-serif);
    color: var(--fg-soft);
    white-space: nowrap;
  }

  .status-tabs {
    display: flex;
    gap: 2px;
    background: var(--ink-900);
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 2px;
    margin-left: auto;
  }
  .tab {
    background: transparent;
    border: none;
    padding: 4px 12px;
    font: 500 12px var(--font-sans);
    color: var(--mute);
    border-radius: 5px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: background 0.1s ease, color 0.1s ease;
  }
  .tab:hover { color: var(--fg); }
  .tab.is-active {
    background: oklch(0.80 0.09 75 / 0.14);
    color: var(--brass);
  }
  .tab-count {
    font: 600 10px var(--font-mono);
    background: rgba(0, 0, 0, 0.25);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .search-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 400 11px var(--font-sans);
    color: var(--mute-2);
  }
  .ksk {
    font: 600 9.5px var(--font-mono);
    opacity: 0.65;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.2);
    color: var(--fg-soft);
  }

  .cols {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .col { display: flex; flex-direction: column; min-height: 0; }
  .col-detail { flex: 1; min-width: 0; }

  .mobile-back, .mobile-back-row { display: none; }

  /* Mobile: single column with view-state toggle */
  @media (max-width: 767px) {
    .topbar { padding: 0 10px; gap: 8px; }
    .crumb { font-size: 11px; }
    .search-hint { display: none; }
    .tab { padding: 4px 8px; font-size: 11px; }

    .cols { flex-direction: column; }
    .col { display: none; }

    .cols[data-mobile-view="list"] .col-sidebar,
    .cols[data-mobile-view="list"] .col-list {
      display: flex;
    }
    .cols[data-mobile-view="detail"] .col-detail {
      display: flex;
    }
    .col-list { flex: 1; }

    .mobile-back-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 6px 12px 0;
      font: 400 11px var(--font-mono);
      color: var(--mute);
    }

    .mobile-back {
      display: inline-flex;
      align-self: flex-start;
      margin: 10px 12px 0;
      padding: 6px 10px;
      background: var(--ink-850);
      border: 1px solid var(--line);
      border-radius: 6px;
      color: var(--fg-soft);
      font: 500 12px var(--font-sans);
      cursor: pointer;
    }
  }
</style>
