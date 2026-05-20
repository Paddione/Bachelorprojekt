---
ticket_id: T000075
title: Admin Sidebar + Ticket Hub Implementation Plan
domains: []
status: active
pr_number: null
---

# Admin Sidebar + Ticket Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix squished admin sidebar icons, add responsive mobile/tablet layout, and replace the floating "Ticket erstellen" button with a full Ticket Hub tab (create + list + edit/close/archive/AI classify) as the first tab in PlatformHub.

**Architecture:** Pure frontend changes — CSS fixes + new `TicketsTab.svelte` component wired into the existing `PlatformHub.svelte` tab system. One new API endpoint (`classify.ts`) uses the existing Anthropic SDK pattern from `claude-session-agent.ts`. No DB schema changes.

**Tech Stack:** Astro, Svelte 5 (runes: `$state`, `$derived`, `$props`), Tailwind CSS, `@anthropic-ai/sdk`, existing `listAdminTickets` / `createAdminTicket` / `patchAdminTicket` / `transitionTicket` lib functions.

---

## File Map

| File | Action |
|------|--------|
| `website/src/styles/admin-premium.css` | Modify — icon size fix, tablet rail, tooltip CSS |
| `website/src/layouts/AdminLayout.astro` | Modify — hamburger button markup, remove TicketWidgetBar showCreate |
| `website/src/components/TicketWidgetBar.astro` | Modify — add `showCreate` prop |
| `website/src/components/admin/PlatformHub.svelte` | Modify — add tickets as first tab, mobile scroll |
| `website/src/components/admin/TicketsTab.svelte` | **Create** — full ticket hub tab |
| `website/src/pages/api/admin/tickets/[id]/classify.ts` | **Create** — AI classification endpoint |

---

## Task 1: Fix sidebar icon sizes

**Files:**
- Modify: `website/src/styles/admin-premium.css`

Root cause: `.nav-icon` is `20×20px` but `[class*="nav-icon-"]` adds `padding: 5px` with `box-sizing: border-box`, leaving only 10×10px for the SVG.

- [ ] **Step 1: Open admin-premium.css and bump .nav-icon size**

Find the `.nav-icon` rule (around line 64) and change width/height from `20px` to `32px`:

```css
.nav-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}
```

The inner SVG now gets `32 - 5 - 5 = 22px` rendering space.

- [ ] **Step 2: Ensure sidebar-nav-item layout fits larger icons**

Find `.sidebar-nav-item` rule and verify/update to handle 32px icon:

```css
.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 10px;
  margin: 1px 8px;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--admin-text-mute);
  transition: background 0.15s ease, color 0.15s ease;
  min-height: 44px;
}
```

- [ ] **Step 3: Verify dev server renders icons correctly**

```bash
cd /tmp/wt-admin-sidebar/website && npm run dev -- --port 4322 &
# open http://localhost:4322/admin in browser — icons should be ~22px, not squished
```

Expected: icons visibly larger, properly padded, no clipping.

- [ ] **Step 4: Commit icon fix**

```bash
cd /tmp/wt-admin-sidebar
git add website/src/styles/admin-premium.css
git commit -m "fix(admin): bump nav-icon container to 32px to fix squished SVG icons"
```

---

## Task 2: Add tablet rail and mobile hamburger CSS

**Files:**
- Modify: `website/src/styles/admin-premium.css`

- [ ] **Step 1: Add tablet icon-rail media query**

Append after the existing `@media (max-width: 767px)` block:

```css
/* Tablet: icon-only rail (768–1023px) */
@media (min-width: 768px) and (max-width: 1023px) {
  #admin-sidebar {
    width: 64px !important;
  }
  #admin-main {
    padding-left: 64px !important;
  }
  .sidebar-label {
    display: none !important;
  }
  .sidebar-group-label {
    display: none !important;
  }
  .sidebar-nav-item {
    justify-content: center;
    padding: 8px;
    margin: 1px 6px;
    position: relative;
  }
  /* Tooltip on hover */
  .sidebar-nav-item[title]:hover::after {
    content: attr(title);
    position: absolute;
    left: 68px;
    top: 50%;
    transform: translateY(-50%);
    background: var(--admin-surface);
    border: 1px solid var(--admin-border-bright);
    color: var(--admin-text);
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 8px;
    white-space: nowrap;
    z-index: 200;
    pointer-events: none;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  }
  /* Hide sidebar-toggle button on tablet */
  #sidebar-toggle {
    display: none !important;
  }
  /* Brand area: icon only */
  #admin-sidebar > div:first-child .sidebar-label {
    display: none !important;
  }
  #admin-sidebar > div:first-child {
    padding: 16px 8px;
    justify-content: center;
  }
}
```

- [ ] **Step 2: Enhance mobile CSS — add backdrop visible state**

Find the existing `@media (max-width: 767px)` block and ensure `#admin-backdrop` is styled:

```css
/* Add to the existing @media (max-width: 767px) block: */
#admin-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 39;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(2px);
}
#admin-backdrop.visible {
  display: block;
}
```

- [ ] **Step 3: Commit responsive CSS**

```bash
cd /tmp/wt-admin-sidebar
git add website/src/styles/admin-premium.css
git commit -m "feat(admin): add tablet icon-rail and backdrop CSS for mobile drawer"
```

---

## Task 3: Add hamburger button to mobile topbar

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`

The `#mobile-topbar` div exists but is empty. The JS already references `mobile-hamburger`.

- [ ] **Step 1: Add hamburger + brand to #mobile-topbar**

Find the empty `<div id="mobile-topbar" style="display:none;">` block and replace it:

```astro
<div id="mobile-topbar" style="display:none;">
  <button
    id="mobile-hamburger"
    aria-label="Menü öffnen"
    style="width:44px; height:44px; display:flex; align-items:center; justify-content:center; background:transparent; border:none; cursor:pointer; color:var(--admin-text); border-radius:10px; flex-shrink:0;"
  >
    <svg id="hamburger-icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px; height:22px;"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    <svg id="hamburger-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px; height:22px; display:none;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  </button>
  <a href="/admin" style="display:flex; align-items:center; gap:10px; text-decoration:none; flex:1; min-width:0;">
    {isKore ? (<div class="ka-brand-mark" style="width:28px; height:28px;" />) : (
      <div style="width:28px; height:28px; border-radius:8px; background:linear-gradient(135deg, var(--admin-primary), #8a6a2a); box-shadow:0 2px 8px rgba(0,0,0,0.3); position:relative; flex-shrink:0;">
        <div style="position:absolute; inset:6px; border-radius:2px; background:var(--admin-bg); clip-path:polygon(0 55%, 30% 55%, 30% 0, 70% 0, 70% 55%, 100% 55%, 100% 100%, 0 100%);"></div>
      </div>
    )}
    <span style="font-family:var(--font-serif); font-size:15px; color:var(--admin-primary); font-weight:700;">{brandWord}</span>
  </a>
  <span style="font-family:var(--font-mono); font-size:10px; color:var(--admin-text-disabled); letter-spacing:0.1em; text-transform:uppercase;">Admin</span>
</div>
```

- [ ] **Step 2: Verify hamburger works on mobile viewport**

In browser devtools, set viewport to 375px width. The topbar should appear with hamburger. Clicking it should slide in the sidebar, clicking backdrop should close it.

- [ ] **Step 3: Commit hamburger markup**

```bash
cd /tmp/wt-admin-sidebar
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(admin): add hamburger button and brand to mobile topbar"
```

---

## Task 4: Remove floating TicketQuickCreate from admin layout

**Files:**
- Modify: `website/src/components/TicketWidgetBar.astro`
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 1: Add showCreate prop to TicketWidgetBar.astro**

Replace the Props interface and component body:

```astro
---
// website/src/components/TicketWidgetBar.astro
import TicketQuickCreate from './TicketQuickCreate.svelte';

interface Props {
  context?: 'admin' | 'portal';
  showCreate?: boolean;
}

const { context = 'portal', showCreate = true } = Astro.props;
---

<div class="fixed bottom-6 right-6 z-40 flex items-center gap-2">
  {showCreate && (
    <TicketQuickCreate client:load context={context} />
  )}
</div>
```

Note: The `showEdit` prop and `TicketQuickEdit` import were already there — this replaces that entire file. Check the current file first (`website/src/components/TicketWidgetBar.astro`) — it passes `showEdit` from AdminLayout. Since ticket edit is now in TicketsTab, drop `showEdit` entirely.

- [ ] **Step 2: Update AdminLayout.astro to pass showCreate={false}**

Find line 287:
```astro
<TicketWidgetBar context="admin" showEdit={!ASSISTANT_ENABLED} />
```

Replace with:
```astro
<TicketWidgetBar context="admin" showCreate={false} />
```

- [ ] **Step 3: Commit cleanup**

```bash
cd /tmp/wt-admin-sidebar
git add website/src/components/TicketWidgetBar.astro website/src/layouts/AdminLayout.astro
git commit -m "feat(admin): remove floating TicketQuickCreate from admin layout"
```

---

## Task 5: Create TicketsTab.svelte

**Files:**
- Create: `website/src/components/admin/TicketsTab.svelte`

- [ ] **Step 1: Create the file**

```svelte
<!-- website/src/components/admin/TicketsTab.svelte -->
<script lang="ts">
  import TicketQuickEdit from './TicketQuickEdit.svelte';
  import type { ListedTicket } from '../../lib/tickets/admin';

  // ── State ────────────────────────────────────────────────
  let tickets = $state<ListedTicket[]>([]);
  let loadingList = $state(true);
  let listError = $state('');
  let inFlight = $state<Record<string, boolean>>({});

  let createFormOpen = $state(true);
  let creating = $state(false);
  let createError = $state('');
  let createSuccess = $state('');

  // Create form fields
  let cType = $state<'feature' | 'task' | 'project'>('task');
  let cTitle = $state('');
  let cDescription = $state('');
  let cPriority = $state<'hoch' | 'mittel' | 'niedrig'>('mittel');
  let cComponent = $state('');

  // Edit modal
  let editTicket = $state<ListedTicket | null>(null);

  // Toast
  let toast = $state<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout>;

  // ── Derived ──────────────────────────────────────────────
  const canCreate = $derived(cTitle.trim().length > 0 && !creating);

  // ── Helpers ──────────────────────────────────────────────
  function showToast(msg: string, kind: 'ok' | 'err') {
    clearTimeout(toastTimer);
    toast = { msg, kind };
    toastTimer = setTimeout(() => { toast = null; }, 3500);
  }

  async function loadTickets() {
    loadingList = true;
    listError = '';
    try {
      const r = await fetch('/api/admin/tickets?limit=20&status=open', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      tickets = j.items ?? [];
    } catch (e) {
      listError = 'Tickets konnten nicht geladen werden.';
    } finally {
      loadingList = false;
    }
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    if (!canCreate) return;
    creating = true;
    createError = '';
    createSuccess = '';
    try {
      const r = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          type: cType, title: cTitle.trim(),
          description: cDescription.trim() || undefined,
          priority: cPriority,
          component: cComponent.trim() || undefined,
        }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? 'Fehler'); }
      cTitle = ''; cDescription = ''; cComponent = '';
      showToast('Ticket erstellt.', 'ok');
      await loadTickets();
    } catch (e: any) {
      createError = e.message;
    } finally {
      creating = false;
    }
  }

  async function handleTransition(ticket: ListedTicket, status: 'done' | 'archived') {
    if (inFlight[ticket.id]) return;
    inFlight = { ...inFlight, [ticket.id]: true };
    try {
      const r = await fetch(`/api/admin/tickets/${ticket.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status, resolution: status === 'done' ? 'fixed' : undefined }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? 'Fehler'); }
      showToast(status === 'done' ? 'Ticket geschlossen.' : 'Ticket archiviert.', 'ok');
      await loadTickets();
    } catch (e: any) {
      showToast(e.message, 'err');
    } finally {
      inFlight = { ...inFlight, [ticket.id]: false };
    }
  }

  async function handleClassify(ticket: ListedTicket) {
    if (inFlight[ticket.id]) return;
    inFlight = { ...inFlight, [ticket.id]: true };
    try {
      const r = await fetch(`/api/admin/tickets/${ticket.id}/classify`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (r.status === 503) { showToast('KI nicht erreichbar.', 'err'); return; }
      if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? 'KI-Fehler'); }
      showToast('KI-Klassifikation gespeichert.', 'ok');
      await loadTickets();
    } catch (e: any) {
      showToast(e.message, 'err');
    } finally {
      inFlight = { ...inFlight, [ticket.id]: false };
    }
  }

  function priorityColor(p: string) {
    if (p === 'hoch') return 'color: #f87171;';
    if (p === 'mittel') return 'color: #fbbf24;';
    return 'color: #6b7280;';
  }

  function typeLabel(t: string) {
    return { bug: 'Bug', feature: 'Feature', task: 'Aufgabe', project: 'Projekt' }[t] ?? t;
  }

  // Load on mount
  $effect(() => { loadTickets(); });
</script>

<!-- ── Layout ─────────────────────────────────────────── -->
<div class="tickets-tab">

  <!-- Two-column on desktop, stacked on mobile -->
  <div class="tickets-layout">

    <!-- CREATE FORM -->
    <div class="tickets-create-panel">
      <button
        class="create-toggle"
        onclick={() => createFormOpen = !createFormOpen}
        aria-expanded={createFormOpen}
      >
        Neues Ticket {createFormOpen ? '▲' : '▼'}
      </button>

      {#if createFormOpen}
        <form onsubmit={handleCreate} class="create-form">
          <label class="field-label">
            Typ
            <select bind:value={cType} class="field-input">
              <option value="task">Aufgabe</option>
              <option value="feature">Feature</option>
              <option value="project">Projekt</option>
            </select>
          </label>

          <label class="field-label">
            Titel <span style="color: var(--admin-primary);">*</span>
            <input
              type="text"
              bind:value={cTitle}
              placeholder="Kurzer Titel..."
              class="field-input"
              required
            />
          </label>

          <label class="field-label">
            Beschreibung
            <textarea
              bind:value={cDescription}
              placeholder="Details, Reproduktionsschritte..."
              class="field-input"
              rows="3"
            ></textarea>
          </label>

          <div class="field-row">
            <label class="field-label" style="flex:1;">
              Priorität
              <select bind:value={cPriority} class="field-input">
                <option value="hoch">Hoch</option>
                <option value="mittel">Mittel</option>
                <option value="niedrig">Niedrig</option>
              </select>
            </label>
            <label class="field-label" style="flex:2;">
              Komponente
              <input
                type="text"
                bind:value={cComponent}
                placeholder="z.B. website, auth..."
                class="field-input"
              />
            </label>
          </div>

          {#if createError}
            <p class="msg-error">{createError}</p>
          {/if}

          <button type="submit" class="btn-primary" disabled={!canCreate}>
            {creating ? 'Wird erstellt…' : '+ Ticket erstellen'}
          </button>
        </form>
      {/if}
    </div>

    <!-- TICKET LIST -->
    <div class="tickets-list-panel">
      <div class="list-header">
        <span class="list-title">Letzte Tickets</span>
        <button class="btn-icon" onclick={loadTickets} title="Aktualisieren" aria-label="Liste aktualisieren">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M2 8a6 6 0 1 0 1.5-3.9M2 4v4h4"/></svg>
        </button>
      </div>

      {#if loadingList}
        {#each [1,2,3] as _}
          <div class="ticket-skeleton"></div>
        {/each}
      {:else if listError}
        <p class="msg-error">{listError} <button class="btn-text" onclick={loadTickets}>Erneut versuchen</button></p>
      {:else if tickets.length === 0}
        <p class="empty-state">Keine offenen Tickets.</p>
      {:else}
        {#each tickets as ticket (ticket.id)}
          <div class="ticket-row">
            <div class="ticket-meta">
              <span class="ticket-id">{ticket.externalId ?? '—'}</span>
              <span class="ticket-type">{typeLabel(ticket.type)}</span>
              <span class="ticket-priority" style={priorityColor(ticket.priority)}>{ticket.priority}</span>
            </div>
            <p class="ticket-title">{ticket.title}</p>
            <div class="ticket-actions">
              <button
                class="btn-action"
                title="Bearbeiten"
                aria-label="Ticket bearbeiten"
                onclick={() => editTicket = ticket}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><path d="M11.5 1.8l2.7 2.7L5 13.7l-3.2.5.5-3.2z"/><path d="M10 3.3l2.7 2.7"/></svg>
                <span class="btn-action-label">Bearbeiten</span>
              </button>
              <button
                class="btn-action"
                title="Schließen"
                aria-label="Ticket schließen"
                disabled={!!inFlight[ticket.id]}
                onclick={() => handleTransition(ticket, 'done')}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><path d="M2.5 8l3.5 3.5 7.5-7"/></svg>
                <span class="btn-action-label">Schließen</span>
              </button>
              <button
                class="btn-action"
                title="Archivieren"
                aria-label="Ticket archivieren"
                disabled={!!inFlight[ticket.id]}
                onclick={() => handleTransition(ticket, 'archived')}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><rect x="2" y="6" width="12" height="8" rx="1"/><path d="M1 3.5h14v2.5H1zM6 10h4"/></svg>
                <span class="btn-action-label">Archiv</span>
              </button>
              <button
                class="btn-action btn-action-ai"
                title="KI klassifizieren"
                aria-label="KI-Klassifikation anwenden"
                disabled={!!inFlight[ticket.id]}
                onclick={() => handleClassify(ticket)}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2 1.5"/></svg>
                <span class="btn-action-label">→ KI</span>
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Edit Modal -->
  {#if editTicket}
    <TicketQuickEdit
      ticket={editTicket}
      onSave={(updated) => { editTicket = null; loadTickets(); }}
      onClose={() => editTicket = null}
    />
  {/if}

  <!-- Toast -->
  {#if toast}
    <div class="toast toast-{toast.kind}" role="status">
      {toast.msg}
    </div>
  {/if}
</div>

<style>
  .tickets-tab {
    position: relative;
    min-height: 200px;
  }

  .tickets-layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 24px;
    align-items: start;
  }

  @media (max-width: 768px) {
    .tickets-layout {
      grid-template-columns: 1fr;
    }
  }

  /* Create panel */
  .tickets-create-panel {
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: 16px;
    padding: 16px;
  }

  .create-toggle {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: var(--admin-text);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
    padding: 0 0 8px;
    border-bottom: 1px solid var(--admin-border);
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .create-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .field-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--admin-text-mute);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field-input {
    background: var(--admin-bg);
    border: 1px solid var(--admin-border);
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 13px;
    color: var(--admin-text);
    font-family: var(--font-sans);
    min-height: 36px;
    transition: border-color 0.15s;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--admin-primary);
  }

  .field-row {
    display: flex;
    gap: 10px;
  }

  .btn-primary {
    background: var(--admin-primary);
    color: var(--admin-bg);
    border: none;
    border-radius: 10px;
    padding: 9px 16px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
    min-height: 44px;
    width: 100%;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* List panel */
  .tickets-list-panel {
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 200px;
  }

  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--admin-border);
    margin-bottom: 4px;
  }

  .list-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--admin-text-mute);
  }

  .btn-icon {
    background: none;
    border: none;
    color: var(--admin-text-mute);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    min-height: 28px;
    transition: color 0.15s;
  }

  .btn-icon:hover { color: var(--admin-text); }

  .ticket-skeleton {
    height: 72px;
    background: linear-gradient(90deg, var(--admin-border) 25%, var(--admin-surface-hover) 50%, var(--admin-border) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 10px;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .ticket-row {
    background: var(--admin-bg);
    border: 1px solid var(--admin-border);
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: border-color 0.15s;
  }

  .ticket-row:hover {
    border-color: var(--admin-border-bright);
  }

  .ticket-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .ticket-id {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--admin-text-disabled);
    background: var(--admin-surface);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .ticket-type {
    font-size: 10px;
    font-weight: 700;
    color: var(--admin-text-mute);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .ticket-priority {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .ticket-title {
    font-size: 13px;
    color: var(--admin-text);
    margin: 0;
    line-height: 1.4;
  }

  .ticket-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  .btn-action {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: 7px;
    padding: 5px 10px;
    font-size: 11px;
    font-weight: 600;
    color: var(--admin-text-mute);
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
    min-height: 30px;
  }

  .btn-action:hover {
    background: var(--admin-surface-hover);
    color: var(--admin-text);
    border-color: var(--admin-border-bright);
  }

  .btn-action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-action-ai {
    color: var(--admin-primary);
    border-color: color-mix(in srgb, var(--admin-primary) 30%, transparent);
  }

  .btn-action-ai:hover {
    background: var(--admin-primary-muted);
    color: var(--admin-primary);
  }

  /* Hide text labels on very small screens, keep icons only */
  @media (max-width: 480px) {
    .btn-action-label { display: none; }
    .btn-action { padding: 5px 8px; }
  }

  .empty-state {
    color: var(--admin-text-disabled);
    font-size: 13px;
    text-align: center;
    padding: 24px;
  }

  .msg-error {
    color: #f87171;
    font-size: 12px;
    margin: 0;
  }

  .btn-text {
    background: none;
    border: none;
    color: var(--admin-primary);
    cursor: pointer;
    font-size: 12px;
    padding: 0;
    text-decoration: underline;
  }

  /* Toast — bottom-center on all viewports */
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    z-index: 9999;
    white-space: nowrap;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    animation: toastIn 0.2s ease;
  }

  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .toast-ok { background: #15803d; color: #fff; }
  .toast-err { background: #991b1b; color: #fff; }
</style>
```

- [ ] **Step 2: Verify TicketsTab compiles without TypeScript errors**

```bash
cd /tmp/wt-admin-sidebar/website
npx tsc --noEmit 2>&1 | grep TicketsTab || echo "no TicketsTab errors"
```

Expected: no errors from TicketsTab.svelte

- [ ] **Step 3: Commit TicketsTab**

```bash
cd /tmp/wt-admin-sidebar
git add website/src/components/admin/TicketsTab.svelte
git commit -m "feat(admin): add TicketsTab with create form, list, and inline actions"
```

---

## Task 6: Create AI classification endpoint

**Files:**
- Create: `website/src/pages/api/admin/tickets/[id]/classify.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
// website/src/pages/api/admin/tickets/[id]/classify.ts
import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getTicketDetail, patchAdminTicket } from '../../../../../lib/tickets/admin';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

const PRIORITY_MAP: Record<string, 'hoch' | 'mittel' | 'niedrig'> = {
  high: 'hoch', critical: 'hoch',
  medium: 'mittel',
  low: 'niedrig',
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  const detail = await getTicketDetail(BRAND(), id);
  if (!detail) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 503 });

  const prompt = `Classify this support ticket and respond with ONLY valid JSON, no other text.

Title: ${detail.title}
Description: ${detail.description ?? '(keine Beschreibung)'}

Respond exactly:
{"component":"<short component name, e.g. website/auth/brett/api>","priority":"low|medium|high|critical","attention_mode":"ai_ready|needs_human"}

Rules:
- component: one lowercase word or slash-path, max 20 chars
- priority: low if minor cosmetic, medium if impactful, high if blocking, critical if data loss
- attention_mode: ai_ready if description is clear and actionable, needs_human if ambiguous`;

  let parsed: { component: string; priority: string; attention_mode: string } | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = msg.content.find(b => b.type === 'text')?.text?.trim() ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
        break;
      }
    } catch (_) {
      if (attempt === 1) {
        return new Response(JSON.stringify({ error: 'LLM nicht erreichbar' }), { status: 503 });
      }
    }
  }

  if (!parsed) {
    return new Response(JSON.stringify({ error: 'KI-Antwort konnte nicht geparst werden' }), { status: 500 });
  }

  const mappedPriority = PRIORITY_MAP[parsed.priority] ?? 'mittel';
  const mappedAttention = ['ai_ready', 'needs_human'].includes(parsed.attention_mode)
    ? parsed.attention_mode as 'ai_ready' | 'needs_human'
    : 'ai_ready';

  await patchAdminTicket({
    brand: BRAND(),
    id,
    component: parsed.component.slice(0, 50) || null,
    priority: mappedPriority,
    attentionMode: mappedAttention,
    actor: { label: session.preferred_username },
  });

  return new Response(JSON.stringify({
    ticket_id: id,
    component: parsed.component,
    priority: mappedPriority,
    attention_mode: mappedAttention,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /tmp/wt-admin-sidebar/website
npx tsc --noEmit 2>&1 | grep classify || echo "no classify errors"
```

Expected: no errors.

- [ ] **Step 3: Commit classify endpoint**

```bash
cd /tmp/wt-admin-sidebar
git add website/src/pages/api/admin/tickets/[id]/classify.ts
git commit -m "feat(admin): add POST /api/admin/tickets/[id]/classify AI classification endpoint"
```

---

## Task 7: Wire TicketsTab into PlatformHub + mobile tab scroll

**Files:**
- Modify: `website/src/components/admin/PlatformHub.svelte`

- [ ] **Step 1: Add TicketsTab import and tab entry**

Replace the `<script>` block:

```svelte
<script lang="ts">
  import SoftwareTab from './platform/SoftwareTab.svelte';
  import HardwareTab from './platform/HardwareTab.svelte';
  import HealthTab from './platform/HealthTab.svelte';
  import FluxCDTab from './platform/FluxCDTab.svelte';
  import DienstTab from './ops/DienstTab.svelte';
  import LogsTab from './ops/LogsTab.svelte';
  import DatenbankTab from './ops/DatenbankTab.svelte';
  import DnsZertTab from './ops/DnsZertTab.svelte';
  import TicketsTab from './TicketsTab.svelte';

  export let cluster: string;

  let activeTab = 'tickets';

  const tabs = [
    { id: 'tickets', label: 'Tickets' },
    { id: 'flux', label: 'GitOps', premium: true },
    { id: 'software', label: 'Software', premium: true },
    { id: 'hardware', label: 'Hardware' },
    { id: 'health', label: 'Integrität', premium: true },
    { id: 'dienste', label: 'Dienste' },
    { id: 'logs', label: 'Logs' },
    { id: 'db', label: 'Datenbank' },
    { id: 'dns', label: 'Netzwerk' }
  ];
</script>
```

- [ ] **Step 2: Add TicketsTab branch and mobile scroll to tab bar**

Find the tab bar `<div class="flex flex-wrap gap-1 ...">` and replace with:

```svelte
<div style="overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 2px;">
  <div class="flex gap-1 p-1 bg-admin-sidebar-bg backdrop-blur-xl border border-admin-border rounded-2xl w-fit mb-8" style="flex-wrap: nowrap;">
    {#each tabs as tab}
      <button
        on:click={() => activeTab = tab.id}
        class="px-5 py-2 rounded-xl text-sm font-bold transition-all {activeTab === tab.id ? 'bg-admin-primary text-admin-bg shadow-lg' : 'text-admin-text-mute hover:text-white'}"
        style="white-space: nowrap; min-height: 44px;"
      >
        {tab.label}
        {#if tab.premium}
          <span class="ml-1 text-[8px] opacity-50">✨</span>
        {/if}
      </button>
    {/each}
  </div>
</div>
```

- [ ] **Step 3: Add TicketsTab render block**

In the `<main>` block, add as the first `{#if}` branch:

```svelte
<main class="transition-all duration-300">
  {#if activeTab === 'tickets'}
    <TicketsTab />
  {:else if activeTab === 'flux'}
    <FluxCDTab {cluster} />
  ... (rest unchanged)
```

- [ ] **Step 4: Verify PlatformHub compiles**

```bash
cd /tmp/wt-admin-sidebar/website
npx tsc --noEmit 2>&1 | grep PlatformHub || echo "no PlatformHub errors"
```

- [ ] **Step 5: Commit PlatformHub wiring**

```bash
cd /tmp/wt-admin-sidebar
git add website/src/components/admin/PlatformHub.svelte
git commit -m "feat(admin): add Tickets as first PlatformHub tab with mobile scroll"
```

---

## Task 8: Run tests + final verification

- [ ] **Step 1: Run offline test suite**

```bash
cd /tmp/wt-admin-sidebar
task test:all 2>&1 | tail -20
```

Expected: all tests pass (or same failures as on main — no regressions introduced).

- [ ] **Step 2: TypeScript full check**

```bash
cd /tmp/wt-admin-sidebar/website
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 3: Visual check — desktop sidebar**

Start dev server: `cd website && npm run dev -- --port 4322`

Open `http://localhost:4322/admin`. Verify:
- Sidebar icons are ~22px, not squished
- Nav items have proper breathing room
- Collapsible groups work

- [ ] **Step 4: Visual check — tablet (768–1023px)**

In browser devtools, set viewport to 900px. Verify:
- Sidebar collapses to 64px icon-only rail
- Text labels hidden
- Tooltip appears on hover

- [ ] **Step 5: Visual check — mobile (<768px)**

In browser devtools, set viewport to 375px. Verify:
- Top bar visible with hamburger button
- Clicking hamburger opens sidebar drawer
- Clicking backdrop closes it
- Nav items close drawer on tap

- [ ] **Step 6: Visual check — PlatformHub Tickets tab**

Navigate to `/admin/platform`. Verify:
- Tickets tab is selected by default
- Create form visible
- Ticket list loads with skeleton → real data
- Tab bar scrolls horizontally on narrow viewport

- [ ] **Step 7: Push branch**

```bash
cd /tmp/wt-admin-sidebar
git push -u origin feature/admin-sidebar-ticket-widget
```

---

## Task 9: Create PR

- [ ] **Step 1: Create PR via gh**

```bash
gh pr create \
  --title "feat(admin): responsive sidebar + Ticket Hub in PlatformHub" \
  --body "$(cat <<'EOF'
## Summary
- Fix squished admin sidebar icons (16px→22px effective SVG size, was 10px due to padding+border-box)
- Add responsive sidebar: tablet → 64px icon rail with tooltips, mobile → full-width hamburger drawer
- Move floating "Ticket erstellen" button into PlatformHub as first tab (Tickets)
- Tickets tab: create form + live list (20 newest open) + inline edit/close/archive/→KI actions
- New POST /api/admin/tickets/[id]/classify endpoint — Haiku classifies component/priority/attention_mode
- All components mobile-first: ≥44px tap targets, stacked layout ≤768px, toast bottom-center

## Test plan
- [ ] task test:all passes
- [ ] npx tsc --noEmit in website/ passes
- [ ] Desktop: sidebar icons no longer squished
- [ ] Tablet (900px): icon-only rail + tooltips
- [ ] Mobile (375px): hamburger → drawer → closes on tap
- [ ] PlatformHub: Tickets tab first, create + list + actions work
- [ ] /api/admin/tickets/[id]/classify returns 200 with valid JSON

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Merge PR**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 3: Deploy to both clusters**

```bash
cd /home/patrick/Bachelorprojekt
git checkout main && git pull --rebase origin main
task feature:website
```

Expected: website rebuilds and rolls on both mentolder + korczewski clusters.
