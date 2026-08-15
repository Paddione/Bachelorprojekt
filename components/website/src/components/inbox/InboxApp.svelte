<!-- website/src/components/inbox/InboxApp.svelte
     Orchestrator for the admin inbox: owns state, fetches, keyboard handlers
     and the top status bar. Delegates rendering to Sidebar / List / Detail. -->
<script lang="ts">
  import type { InboxItem, InboxStatus, Message } from '../../lib/messaging-db';
  import InboxList    from './InboxList.svelte';
  import InboxDetail  from './InboxDetail.svelte';
  import { handle as handleShortcut } from './inbox-shortcuts';
  import { primaryActionFor } from './inbox-actions';
  import { browserLogger } from '$lib/browser-logger';

  interface Props {
    initialItems: InboxItem[];
    initialCounts: Record<string, number>;
  }

  const { initialItems, initialCounts }: Props = $props();

  // ── State ────────────────────────────────────────────────────────────────
  let items   = $state<InboxItem[]>(initialItems);
  let counts  = $state<Record<string, number>>(initialCounts);

  // Read initial status from the URL query param (?status=pending|done|archived).
  // "done" is the public label for "actioned" in the DB.
  function readInitialStatus(): InboxStatus {
    if (typeof window === 'undefined') return 'pending';
    const s = new URLSearchParams(window.location.search).get('status');
    if (s === 'done') return 'actioned';
    if (s === 'pending' || s === 'actioned' || s === 'archived') return s;
    return 'pending';
  }

  let activeStatus = $state<InboxStatus>(readInitialStatus());

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
  let replyTextarea: HTMLTextAreaElement | null = $state(null);

  // ── Compose (Neue Nachricht) ──────────────────────────────────────────────
  interface CustomerOption { id: string; name: string; email: string; }
  let composeOpen = $state(false);
  let composeCustomers = $state<CustomerOption[]>([]);
  let composeCustomersLoaded = $state(false);
  let composeSearch = $state('');
  let composeSelectedCustomer = $state<CustomerOption | null>(null);
  let composeBody = $state('');
  let composeSending = $state(false);
  let composeError = $state('');
  let composeSuccess = $state('');

  const composeFiltered = $derived(
    composeSearch.length < 1
      ? composeCustomers
      : composeCustomers.filter(
          c =>
            c.name.toLowerCase().includes(composeSearch.toLowerCase()) ||
            c.email.toLowerCase().includes(composeSearch.toLowerCase()),
        ),
  );

  async function openCompose(): Promise<void> {
    composeOpen = true;
    composeError = '';
    composeSuccess = '';
    composeBody = '';
    composeSearch = '';
    composeSelectedCustomer = null;
    if (!composeCustomersLoaded) {
      try {
        const res = await fetch('/api/admin/customers-list');
        if (res.ok) composeCustomers = await res.json();
      } catch { /* dropdown stays empty */ } finally {
        composeCustomersLoaded = true;
      }
    }
  }

  function closeCompose(): void {
    if (composeSending) return;
    composeOpen = false;
  }

  async function sendCompose(): Promise<void> {
    composeError = '';
    if (!composeSelectedCustomer) { composeError = 'Bitte einen Empfänger auswählen.'; return; }
    if (!composeBody.trim()) { composeError = 'Bitte eine Nachricht eingeben.'; return; }
    composeSending = true;
    try {
      const res = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: composeSelectedCustomer.id, body: composeBody.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { composeError = data.error ?? `Fehler (${res.status})`; return; }
      composeSuccess = 'Nachricht gesendet.';
      // Reload inbox so the new thread appears
      setTimeout(() => { closeCompose(); void reload(); }, 1200);
    } catch {
      composeError = 'Netzwerkfehler. Bitte erneut versuchen.';
    } finally {
      composeSending = false;
    }
  }
  let awaitingG = false;
  let pointerFine = $state(true);

  // ── Derived ──────────────────────────────────────────────────────────────
  const visible = $derived(items);

  const selected = $derived(visible.find(i => i.id === selectedId) ?? null);

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

  function dispatch(action: ReturnType<typeof handleShortcut>['action']): void {
    if (!action) return;
    switch (action.kind) {
      case 'select-next': moveSelection(+1); break;
      case 'select-prev': moveSelection(-1); break;
      case 'set-status':  setStatus(action.status); break;
      case 'focus-reply':  replyTextarea?.focus(); break;
      case 'send-reply':   void sendReply(); break;
      case 'action':
        if (action.name === 'primary') void runPrimary();
        else void runSecondary();
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
    // Always mirror the active status into the URL so that the test assertion
    // `expect(page).toHaveURL(/status=…/)` works (spec §11.2), even when the
    // status hasn't changed (e.g. clicking the already-active tab to re-anchor
    // the URL on a fresh page load that had no ?status= param).
    if (typeof window !== 'undefined' && typeof window.history !== 'undefined') {
      const u = new URL(window.location.href);
      // Expose the public label "done" in the URL (maps to "actioned" in DB).
      u.searchParams.set('status', s === 'actioned' ? 'done' : s);
      window.history.replaceState(null, '', u.toString());
    }
    if (s === activeStatus) return;
    activeStatus = s;
    void reload();
  }

  async function reload(): Promise<void> {
    try {
      const p = new URLSearchParams({ status: activeStatus });
      // E2E-only escape hatch (T001456): forward ?includeTest=1 from the page
      // URL so the suite can see its seeded is_test_data rows.
      if (typeof window !== 'undefined'
          && new URLSearchParams(window.location.search).get('includeTest') === '1') {
        p.set('includeTest', '1');
      }
      const res = await fetch(`/api/admin/inbox?${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { items: InboxItem[]; counts: Record<string, number> };
      items = data.items ?? [];
      counts = data.counts ?? {};
      selectedId = null;
    } catch (err) {
      browserLogger.error({ err }, '[InboxApp] reload failed');
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
      const newVisible = items;
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
        data-status="done"
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

    <button
      type="button"
      class="compose-btn"
      data-testid="inbox-compose-btn"
      onclick={() => { void openCompose(); }}
      title="Neue Nachricht verfassen"
    >+ Neue Nachricht</button>

  </header>

  <!-- Two columns: list + detail -->
  <div class="cols" data-mobile-view={mobileView}>

    <div class="col col-list">
      <div class="mobile-back-row">
        <span class="mobile-status-line">{visibleTotal} {visibleTotal === 1 ? 'Eintrag' : 'Einträge'}</span>
      </div>
      <InboxList
        items={visible}
        selectedId={selectedId}
        activeStatus={activeStatus}
        busy={busy}
        onSelect={selectItem}
        onQuickDone={(id) => { void quickDone(id); }}
      />
    </div>

    <div class="col col-detail">
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
        showMobileBack={mobileView === 'detail'}
        bindReplyTextarea={(el) => { replyTextarea = el; }}
        onPrev={() => moveSelection(-1)}
        onNext={() => moveSelection(+1)}
        onPrimary={runPrimary}
        onSecondary={runSecondary}
        onDelete={deleteItem}
        onReplyChange={(v) => { replyBody = v; }}
        onSendReply={sendReply}
        onBugNoteChange={(v) => { bugNote = v; }}
        onMobileBack={() => { mobileView = 'list'; }}
      />
    </div>
  </div>

  {#if composeOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="compose-backdrop"
      data-testid="inbox-compose-modal"
      onclick={(e) => { if (e.target === e.currentTarget) closeCompose(); }}
    >
      <div class="compose-modal">
        <div class="compose-header">
          <h2 class="compose-title">Neue Nachricht</h2>
          <button
            type="button"
            class="compose-close"
            onclick={closeCompose}
            disabled={composeSending}
            aria-label="Schließen"
          >✕</button>
        </div>

        <div class="compose-body">
          {#if composeError}
            <div class="compose-alert compose-alert-err">{composeError}</div>
          {/if}
          {#if composeSuccess}
            <div class="compose-alert compose-alert-ok">{composeSuccess}</div>
          {/if}

          <div class="compose-field">
            <label class="compose-label">Empfänger</label>
            {#if composeSelectedCustomer}
              <div class="compose-selected-customer">
                <span class="compose-selected-name">{composeSelectedCustomer.name}</span>
                <span class="compose-selected-email">{composeSelectedCustomer.email}</span>
                <button
                  type="button"
                  class="compose-clear"
                  onclick={() => { composeSelectedCustomer = null; composeSearch = ''; }}
                  disabled={composeSending}
                >✕</button>
              </div>
            {:else}
              <input
                type="text"
                class="compose-input"
                placeholder="Name oder E-Mail suchen…"
                bind:value={composeSearch}
                disabled={composeSending}
                data-testid="inbox-compose-recipient-search"
              />
              {#if composeSearch.length > 0}
                {#if composeFiltered.length > 0}
                  <div class="compose-dropdown" data-testid="inbox-compose-recipient-dropdown">
                    {#each composeFiltered.slice(0, 10) as c}
                      <button
                        type="button"
                        class="compose-dropdown-item"
                        onclick={() => { composeSelectedCustomer = c; composeSearch = ''; }}
                        disabled={composeSending}
                      >
                        <span class="compose-dropdown-name">{c.name}</span>
                        <span class="compose-dropdown-email">{c.email}</span>
                      </button>
                    {/each}
                  </div>
                {:else}
                  <div class="compose-dropdown-empty">Kein Kunde gefunden.</div>
                {/if}
              {/if}
            {/if}
          </div>

          <div class="compose-field">
            <label class="compose-label">Nachricht</label>
            <textarea
              class="compose-textarea"
              rows="5"
              placeholder="Nachricht an den Kunden…"
              bind:value={composeBody}
              disabled={composeSending}
              data-testid="inbox-compose-body"
            ></textarea>
          </div>
        </div>

        <div class="compose-footer">
          <button
            type="button"
            class="compose-cancel"
            onclick={closeCompose}
            disabled={composeSending}
          >Abbrechen</button>
          <button
            type="button"
            class="compose-send"
            onclick={() => { void sendCompose(); }}
            disabled={composeSending || !composeSelectedCustomer || !composeBody.trim()}
            data-testid="inbox-compose-send"
          >{composeSending ? '…' : 'Senden'}</button>
        </div>
      </div>
    </div>
  {/if}
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

  .ksk {
    font: 600 9.5px var(--font-mono);
    opacity: 0.65;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.2);
    color: var(--fg-soft);
  }

  .compose-btn {
    flex-shrink: 0;
    height: 28px;
    padding: 0 12px;
    background: oklch(0.80 0.09 75 / 0.15);
    border: 1px solid oklch(0.80 0.09 75 / 0.35);
    border-radius: 6px;
    color: var(--brass);
    font: 600 12px var(--font-sans);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.1s ease, border-color 0.1s ease;
  }
  .compose-btn:hover {
    background: oklch(0.80 0.09 75 / 0.25);
    border-color: oklch(0.80 0.09 75 / 0.55);
  }

  /* ── Compose modal ────────────────────────────────────────────── */
  .compose-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
  }

  .compose-modal {
    width: 100%;
    max-width: 520px;
    background: var(--ink-850);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .compose-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--line);
    background: var(--ink-900);
  }

  .compose-title {
    font: 600 15px var(--font-serif);
    color: var(--fg);
    margin: 0;
  }

  .compose-close {
    background: none;
    border: none;
    color: var(--mute);
    font-size: 16px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
    transition: color 0.1s ease;
  }
  .compose-close:hover { color: var(--fg); }
  .compose-close:disabled { opacity: 0.4; cursor: not-allowed; }

  .compose-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: 70vh;
    overflow-y: auto;
  }

  .compose-alert {
    padding: 10px 12px;
    border-radius: 6px;
    font: 400 13px var(--font-sans);
  }
  .compose-alert-err { background: oklch(0.40 0.20 15 / 0.2); border: 1px solid oklch(0.55 0.22 15 / 0.4); color: oklch(0.80 0.16 15); }
  .compose-alert-ok  { background: oklch(0.40 0.15 145 / 0.2); border: 1px solid oklch(0.55 0.18 145 / 0.4); color: oklch(0.80 0.14 145); }

  .compose-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: relative;
  }

  .compose-label {
    font: 500 11px var(--font-sans);
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .compose-input,
  .compose-textarea {
    width: 100%;
    background: var(--ink-900);
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 9px 12px;
    font: 400 13px var(--font-sans);
    color: var(--fg);
    outline: none;
    transition: border-color 0.1s ease;
    box-sizing: border-box;
  }
  .compose-input:focus,
  .compose-textarea:focus { border-color: var(--brass); }
  .compose-input::placeholder,
  .compose-textarea::placeholder { color: var(--mute-2); }
  .compose-input:disabled,
  .compose-textarea:disabled { opacity: 0.5; }
  .compose-textarea { resize: vertical; min-height: 100px; }

  .compose-selected-customer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    background: oklch(0.80 0.09 75 / 0.08);
    border: 1px solid oklch(0.80 0.09 75 / 0.35);
    border-radius: 7px;
    font: 400 13px var(--font-sans);
  }
  .compose-selected-name { color: var(--fg); font-weight: 500; }
  .compose-selected-email { color: var(--mute); font-size: 12px; flex: 1; }
  .compose-clear {
    background: none;
    border: none;
    color: var(--mute);
    cursor: pointer;
    font-size: 13px;
    padding: 0 2px;
    border-radius: 3px;
    transition: color 0.1s ease;
    flex-shrink: 0;
  }
  .compose-clear:hover { color: var(--fg); }
  .compose-clear:disabled { opacity: 0.4; cursor: not-allowed; }

  .compose-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--ink-850);
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 10;
    max-height: 200px;
    overflow-y: auto;
  }

  .compose-dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: none;
    border: none;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
    text-align: left;
    transition: background 0.1s ease;
  }
  .compose-dropdown-item:last-child { border-bottom: none; }
  .compose-dropdown-item:hover { background: var(--ink-900); }
  .compose-dropdown-item:disabled { opacity: 0.4; cursor: not-allowed; }
  .compose-dropdown-name { font: 500 13px var(--font-sans); color: var(--fg); }
  .compose-dropdown-email { font: 400 12px var(--font-sans); color: var(--mute); flex: 1; text-align: right; }

  .compose-dropdown-empty {
    padding: 10px 12px;
    font: 400 13px var(--font-sans);
    color: var(--mute);
  }

  .compose-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--line);
    background: var(--ink-900);
  }

  .compose-cancel {
    background: none;
    border: none;
    color: var(--mute);
    font: 500 13px var(--font-sans);
    cursor: pointer;
    padding: 7px 14px;
    border-radius: 6px;
    transition: color 0.1s ease;
  }
  .compose-cancel:hover { color: var(--fg); }
  .compose-cancel:disabled { opacity: 0.4; cursor: not-allowed; }

  .compose-send {
    background: oklch(0.80 0.09 75 / 0.18);
    border: 1px solid oklch(0.80 0.09 75 / 0.4);
    color: var(--brass);
    font: 600 13px var(--font-sans);
    cursor: pointer;
    padding: 7px 18px;
    border-radius: 6px;
    transition: background 0.1s ease, border-color 0.1s ease, opacity 0.1s ease;
  }
  .compose-send:hover:not(:disabled) {
    background: oklch(0.80 0.09 75 / 0.28);
    border-color: oklch(0.80 0.09 75 / 0.6);
  }
  .compose-send:disabled { opacity: 0.4; cursor: not-allowed; }

  @media (max-width: 767px) {
    .compose-btn { font-size: 11px; padding: 0 8px; }
    .compose-modal { max-width: 100%; border-radius: 10px 10px 0 0; }
    .compose-backdrop { align-items: flex-end; padding: 0; }
  }

  .cols {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .col { display: flex; flex-direction: column; min-height: 0; }
  .col-detail { flex: 1; min-width: 0; }

  .mobile-back-row { display: none; }

  /* Mobile: single column with view-state toggle */
  @media (max-width: 767px) {
    .topbar { padding: 0 10px; gap: 8px; }
    .crumb { font-size: 11px; }
    .tab { padding: 4px 8px; font-size: 11px; }

    .cols { flex-direction: column; }
    .col { display: none; }

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
  }
</style>
