---
ticket_id: T000101
title: Admin Sidekick Upgrade + Platform Control Center Cleanup
domains: []
status: active
pr_number: null
---

# Admin Sidekick Upgrade + Platform Control Center Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the duplicate Tickets tab from Platform Control Center and upgrade the Multi-Sidekick drawer with a polished visual design plus two new admin-only views (Anfragen + Postfach).

**Architecture:** Extend the existing `PortalSidekick` view-state machine with two new states (`tickets`, `inbox`) gated by `helpContext === 'admin'`. The new views (`TicketSidekickView`, `InboxSidekickView`) are standalone Svelte components that use already-existing API endpoints. Visual upgrades are CSS/SVG changes in `SidekickHeader` and `SidekickHome`.

**Tech Stack:** Svelte 5 (runes), Astro, TypeScript. APIs: `/api/admin/tickets/index.ts`, `/api/admin/tickets/[id]/transition.ts`, `/api/admin/inbox.ts`, `/api/admin/inbox/[id]/action.ts`. Type sources: `src/lib/tickets/admin.ts`, `src/lib/messaging-db.ts`, `src/components/inbox/type-meta.ts`.

---

## File Map

| File | Action |
|---|---|
| `website/src/components/admin/PlatformHub.svelte` | Edit — remove Tickets tab, default → `flux` |
| `website/src/components/assistant/SidekickHeader.svelte` | Edit — visual upgrade |
| `website/src/components/assistant/SidekickHome.svelte` | Edit — SVG icons, admin cards, CSS vars |
| `website/src/components/PortalSidekick.svelte` | Edit — FAB upgrade, view union, new imports |
| `website/src/components/assistant/TicketSidekickView.svelte` | **New** |
| `website/src/components/assistant/InboxSidekickView.svelte` | **New** |

---

## Task 1: Remove Tickets Tab from Platform Control Center

**Files:**
- Modify: `website/src/components/admin/PlatformHub.svelte`

- [ ] **Step 1: Open the file and make the following changes**

In `website/src/components/admin/PlatformHub.svelte`:

Remove the import (line 10):
```svelte
<!-- DELETE this line: -->
import TicketsTab from './TicketsTab.svelte';
```

Change the `tabs` array — remove the first entry:
```svelte
<!-- BEFORE -->
const tabs = [
  { id: 'tickets', label: 'Tickets' },
  { id: 'flux', label: 'GitOps', premium: true },
  ...
];

<!-- AFTER -->
const tabs = [
  { id: 'flux', label: 'GitOps', premium: true },
  { id: 'software', label: 'Software', premium: true },
  { id: 'hardware', label: 'Hardware' },
  { id: 'health', label: 'Integrität', premium: true },
  { id: 'dienste', label: 'Dienste' },
  { id: 'logs', label: 'Logs' },
  { id: 'db', label: 'Datenbank' },
  { id: 'dns', label: 'Netzwerk' }
];
```

Change the default active tab:
```svelte
<!-- BEFORE -->
let activeTab = 'tickets';
<!-- AFTER -->
let activeTab = 'flux';
```

Remove the conditional branch in `<main>`:
```svelte
<!-- DELETE this block: -->
{#if activeTab === 'tickets'}
  <TicketsTab />
{:else if activeTab === 'flux'}
```
Replace with:
```svelte
{#if activeTab === 'flux'}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /tmp/wt-admin-sidekick-tickets-ui/website && npx tsc --noEmit 2>&1 | grep -i "platformhub\|ticketstab" || echo "No errors for changed files"
```

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-admin-sidekick-tickets-ui
git add website/src/components/admin/PlatformHub.svelte
git commit -m "feat(platform): remove Tickets tab from Platform Hub, default to GitOps"
```

---

## Task 2: Visual Upgrade — SidekickHeader

**Files:**
- Modify: `website/src/components/assistant/SidekickHeader.svelte`

- [ ] **Step 1: Replace the `.header` and `.title` CSS rules**

The current `<style>` block has:
```css
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: #1a2235;
  border-bottom: 1px solid #243049;
  flex-shrink: 0;
  min-height: 44px;
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: #e8e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

Replace with:
```css
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: #0f1623;
  border-bottom: 1px solid rgba(232, 200, 112, 0.15);
  flex-shrink: 0;
  min-height: 44px;
}

.title {
  font-size: 10px;
  font-weight: 500;
  color: #e8e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Geist Mono', monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
```

- [ ] **Step 2: Commit**

```bash
cd /tmp/wt-admin-sidekick-tickets-ui
git add website/src/components/assistant/SidekickHeader.svelte
git commit -m "feat(sidekick): upgrade header to mono font + gold-tinted border"
```

---

## Task 3: Visual Upgrade — SidekickHome + Admin Cards

**Files:**
- Modify: `website/src/components/assistant/SidekickHome.svelte`

- [ ] **Step 1: Replace the entire SidekickHome.svelte with the upgraded version**

```svelte
<script lang="ts">
  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox';

  let {
    onNavigate,
    pendingQuestionnaires = 0,
    helpSection = '',
    helpContext = 'portal',
    pendingTickets = 0,
    pendingInbox = 0,
  }: {
    onNavigate: (view: View) => void;
    pendingQuestionnaires?: number;
    helpSection?: string;
    helpContext?: string;
    pendingTickets?: number;
    pendingInbox?: number;
  } = $props();

  const isAdmin = $derived(helpContext === 'admin');

  // SVG icon strings — same 16px viewBox style as AdminLayout icons
  const icons = {
    clipboard: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M5.5 2.5h5v2.5h-5V2.5z"/><rect x="3" y="2.5" width="10" height="12" rx="1"/><path d="M5.5 7.5h5M5.5 10.5h5M5.5 13.5h3"/></svg>`,
    bug: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><circle cx="8" cy="9" r="3.5"/><path d="M8 5.5V3.5M5 7H2.5M11 7h2.5M5.5 5l-2-2M10.5 5l2-2M5 12l-2 1.5M11 12l2 1.5"/></svg>`,
    tag: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M2 2.5h4.5l7 7a2 2 0 0 1 0 2.8l-2.2 2.2a2 2 0 0 1-2.8 0l-7-7V2.5z"/><circle cx="5.5" cy="5.5" r=".75" fill="currentColor" stroke="none"/></svg>`,
    inbox: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><rect x="2" y="3.5" width="12" height="10" rx="1"/><path d="M2 10h3.5l1.5 2 1.5-2H12"/></svg>`,
  };
</script>

<div class="home">
  <p class="greeting">Wie kann ich dir helfen?</p>

  <div class="cards">
    {#if isAdmin}
      <button class="card" onclick={() => onNavigate('tickets')}>
        <span class="card-icon">{@html icons.tag}</span>
        <div class="card-body">
          <span class="card-label">Anfragen</span>
          <span class="card-desc">Tickets erstellen &amp; bearbeiten</span>
        </div>
        {#if pendingTickets > 0}
          <span class="badge">{pendingTickets > 99 ? '99+' : pendingTickets}</span>
        {/if}
        <span class="chevron">›</span>
      </button>

      <button class="card" onclick={() => onNavigate('inbox')}>
        <span class="card-icon">{@html icons.inbox}</span>
        <div class="card-body">
          <span class="card-label">Postfach</span>
          <span class="card-desc">Nachrichten &amp; Anfragen</span>
        </div>
        {#if pendingInbox > 0}
          <span class="badge">{pendingInbox > 99 ? '99+' : pendingInbox}</span>
        {/if}
        <span class="chevron">›</span>
      </button>
    {/if}

    <button class="card" onclick={() => onNavigate('questionnaire')}>
      <span class="card-icon">{@html icons.clipboard}</span>
      <div class="card-body">
        <span class="card-label">Fragebögen</span>
        <span class="card-desc">Aufgaben beantworten</span>
      </div>
      {#if pendingQuestionnaires > 0}
        <span class="badge">{pendingQuestionnaires > 99 ? '99+' : pendingQuestionnaires}</span>
      {/if}
      <span class="chevron">›</span>
    </button>

    <button class="card" onclick={() => onNavigate('support')}>
      <span class="card-icon">{@html icons.bug}</span>
      <div class="card-body">
        <span class="card-label">Feedback &amp; Support</span>
        <span class="card-desc">Fehler melden, Ideen teilen</span>
      </div>
      <span class="chevron">›</span>
    </button>

    {#if helpSection}
      <button class="card" onclick={() => onNavigate('help')}>
        <span class="card-icon card-icon-help">?</span>
        <div class="card-body">
          <span class="card-label">Hilfe</span>
          <span class="card-desc">Kontexthilfe für diese Seite</span>
        </div>
        <span class="chevron">›</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .home {
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .greeting {
    font-size: 13px;
    color: var(--admin-text-mute, #8899aa);
    margin: 0;
    font-weight: 500;
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 12px;
    background: var(--admin-surface, #131f33);
    border: 1px solid var(--admin-border, #243049);
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
    width: 100%;
  }
  .card:hover {
    border-color: rgba(232, 200, 112, 0.4);
    background: #1a2438;
  }

  .card-icon {
    font-size: 20px;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--admin-text-mute, #8899aa);
  }

  .card-icon-help {
    background: #4f46e5;
    border-radius: 50%;
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    font-style: normal;
  }

  .card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-label {
    font-size: 13px;
    font-weight: 600;
    color: #e8e8f0;
  }

  .card-desc {
    font-size: 11px;
    color: var(--admin-text-mute, #5566aa);
  }

  .badge {
    flex-shrink: 0;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: #ef4444;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: monospace;
  }

  .chevron {
    font-size: 18px;
    color: #5566aa;
    flex-shrink: 0;
    line-height: 1;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
cd /tmp/wt-admin-sidekick-tickets-ui
git add website/src/components/assistant/SidekickHome.svelte
git commit -m "feat(sidekick): upgrade home cards with SVG icons + admin Tickets/Inbox cards"
```

---

## Task 4: Upgrade PortalSidekick — FAB + View Extension

**Files:**
- Modify: `website/src/components/PortalSidekick.svelte`

- [ ] **Step 1: Replace the `<script>` block imports and types**

In the `<script lang="ts">` section, replace:
```typescript
import SidekickHeader from './assistant/SidekickHeader.svelte';
import SidekickHome from './assistant/SidekickHome.svelte';
import SupportView from './assistant/SupportView.svelte';
import QuestionnaireView from './assistant/QuestionnaireView.svelte';
import HelpView from './assistant/HelpView.svelte';

type View = 'home' | 'support' | 'questionnaire' | 'help';
```

With:
```typescript
import SidekickHeader from './assistant/SidekickHeader.svelte';
import SidekickHome from './assistant/SidekickHome.svelte';
import SupportView from './assistant/SupportView.svelte';
import QuestionnaireView from './assistant/QuestionnaireView.svelte';
import HelpView from './assistant/HelpView.svelte';
import TicketSidekickView from './assistant/TicketSidekickView.svelte';
import InboxSidekickView from './assistant/InboxSidekickView.svelte';

type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox';
```

- [ ] **Step 2: Extend titleMap**

Find:
```typescript
const titleMap: Record<View, string> = {
  home: 'Sidekick',
  support: 'Feedback & Support',
  questionnaire: 'Fragebögen',
  help: 'Hilfe',
};
```

Replace with:
```typescript
const titleMap: Record<View, string> = {
  home: 'Sidekick',
  support: 'Feedback & Support',
  questionnaire: 'Fragebögen',
  help: 'Hilfe',
  tickets: 'Anfragen',
  inbox: 'Postfach',
};
```

- [ ] **Step 3: Add pendingTickets state + fetch**

After `let pendingQuestionnaires = $state(0);` add:
```typescript
let pendingTickets = $state(0);
```

Inside the existing `$effect` that fetches questionnaires, after the questionnaire fetch block, add:
```typescript
if (helpContext === 'admin') {
  try {
    const tRes = await fetch('/api/admin/tickets?limit=1&status=open', { credentials: 'same-origin' });
    if (tRes.ok) {
      const td = await tRes.json() as { total?: number };
      pendingTickets = td.total ?? 0;
    }
  } catch {
    // optional — badge just stays 0
  }
}
```

- [ ] **Step 4: Pass new props to SidekickHome**

Find the `<SidekickHome .../>` usage:
```svelte
<SidekickHome
  onNavigate={navigate}
  {pendingQuestionnaires}
  {helpSection}
  {helpContext}
/>
```

Replace with:
```svelte
<SidekickHome
  onNavigate={navigate}
  {pendingQuestionnaires}
  {helpSection}
  {helpContext}
  {pendingTickets}
  pendingInbox={inboxPending}
/>
```

Where `inboxPending` is NOT available in PortalSidekick.svelte scope — we use `pendingTickets` for tickets, and for inbox we re-use the `pendingQuestionnaires` pattern. Add `let inboxPending = $state(0);` after `let pendingTickets = $state(0);` and fetch it in the same `$effect`:

```typescript
let inboxPending = $state(0);
```

In the `$effect`, after the `pendingTickets` fetch, add:
```typescript
if (helpContext === 'admin') {
  try {
    const iRes = await fetch('/api/admin/inbox/count', { credentials: 'same-origin' });
    if (iRes.ok) {
      const id = await iRes.json() as { total?: number };
      inboxPending = id.total ?? 0;
    }
  } catch {
    // optional
  }
}
```

And update the `SidekickHome` call:
```svelte
<SidekickHome
  onNavigate={navigate}
  {pendingQuestionnaires}
  {helpSection}
  {helpContext}
  {pendingTickets}
  pendingInbox={inboxPending}
/>
```

- [ ] **Step 5: Add new view renders in the drawer body**

Find the drawer body `{#if view === 'home'}` block and add after the `{:else if view === 'help'}` branch:
```svelte
{:else if view === 'tickets'}
  <TicketSidekickView onClose={closeDrawer} />
{:else if view === 'inbox'}
  <InboxSidekickView onClose={closeDrawer} />
```

The full block becomes:
```svelte
{#if view === 'home'}
  <SidekickHome
    onNavigate={navigate}
    {pendingQuestionnaires}
    {helpSection}
    {helpContext}
    {pendingTickets}
    pendingInbox={inboxPending}
  />
{:else if view === 'support'}
  <SupportView onCloseView={() => { view = 'home'; }} />
{:else if view === 'questionnaire'}
  <QuestionnaireView onCloseView={() => { view = 'home'; }} />
{:else if view === 'help'}
  <HelpView section={helpSection} context={helpContext} />
{:else if view === 'tickets'}
  <TicketSidekickView onClose={closeDrawer} />
{:else if view === 'inbox'}
  <InboxSidekickView onClose={closeDrawer} />
{/if}
```

- [ ] **Step 6: Replace the FAB button HTML and CSS**

Find the FAB `<button>` block:
```svelte
<button
  class="fab"
  onclick={open ? closeDrawer : openDrawer}
  aria-label={open ? 'Sidekick schließen' : 'Sidekick öffnen'}
  aria-expanded={open}
>
  {#if pendingQuestionnaires > 0 && !open}
    <span class="fab-badge">{pendingQuestionnaires > 9 ? '9+' : pendingQuestionnaires}</span>
  {/if}
  <span class="fab-icon">{open ? '✕' : '🛎'}</span>
</button>
```

Replace with:
```svelte
<button
  class="fab"
  onclick={open ? closeDrawer : openDrawer}
  aria-label={open ? 'Sidekick schließen' : 'Sidekick öffnen'}
  aria-expanded={open}
>
  {#if (pendingQuestionnaires > 0 || pendingTickets > 0 || inboxPending > 0) && !open}
    <span class="fab-badge">{Math.min(99, pendingQuestionnaires + pendingTickets + inboxPending)}</span>
  {/if}
  {#if open}
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true">
      <path d="M3 3l10 10M13 3L3 13"/>
    </svg>
  {:else}
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true">
      <path d="M8 2.5a4 4 0 0 0-4 4c0 2.5-1.5 3.5-1.5 3.5h11S12 9 12 6.5a4 4 0 0 0-4-4z"/>
      <path d="M7 13.5h2"/>
    </svg>
  {/if}
</button>
```

In the `<style>` block replace the `.fab` rule:
```css
.fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9040;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #e8c870;
  color: #0f1623;
  border: 1.5px solid rgba(232, 200, 112, 0.35);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  transition: transform 0.15s, box-shadow 0.15s;
}
.fab:hover {
  transform: scale(1.06);
  box-shadow: 0 6px 24px rgba(232, 200, 112, 0.25), 0 4px 16px rgba(0, 0, 0, 0.4);
}
```

Also remove the `.fab-icon` rule (no longer needed — raw SVG is used directly).

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-admin-sidekick-tickets-ui
git add website/src/components/PortalSidekick.svelte
git commit -m "feat(sidekick): upgrade FAB to SVG bell + extend view state machine for tickets/inbox"
```

---

## Task 5: Create TicketSidekickView.svelte

**Files:**
- Create: `website/src/components/assistant/TicketSidekickView.svelte`

Note: The tickets API only allows types `feature | task | project` for admin creation (bugs go through `/api/bug-report`). Status changes go through `POST /api/admin/tickets/:id/transition` — NOT PATCH.

- [ ] **Step 1: Create the file**

```svelte
<!-- website/src/components/assistant/TicketSidekickView.svelte -->
<script lang="ts">
  type TicketType = 'feature' | 'task' | 'project';
  type TicketStatus = 'triage' | 'backlog' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'archived';
  type TicketPriority = 'hoch' | 'mittel' | 'niedrig';

  interface TicketRow {
    id: string;
    externalId: string | null;
    type: TicketType;
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
    component: string | null;
  }

  let { onClose }: { onClose: () => void } = $props();

  // ── Create form ──────────────────────────────────────────
  let createOpen = $state(true);
  let cType = $state<TicketType>('task');
  let cTitle = $state('');
  let cDescription = $state('');
  let cPriority = $state<TicketPriority>('mittel');
  let cComponent = $state('');
  let creating = $state(false);
  let createError = $state('');

  const canCreate = $derived(cTitle.trim().length > 0 && !creating);

  // ── List ────────────────────────────────────────────────
  let tickets = $state<TicketRow[]>([]);
  let loading = $state(true);
  let listError = $state('');

  // ── Toast ───────────────────────────────────────────────
  let toast = $state<{ msg: string; ok: boolean } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout>;

  function showToast(msg: string, ok: boolean) {
    clearTimeout(toastTimer);
    toast = { msg, ok };
    toastTimer = setTimeout(() => { toast = null; }, 3000);
  }

  async function loadTickets() {
    loading = true;
    listError = '';
    try {
      const r = await fetch('/api/admin/tickets?limit=7&status=open', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { items: TicketRow[] };
      tickets = j.items ?? [];
    } catch {
      listError = 'Tickets konnten nicht geladen werden.';
    } finally {
      loading = false;
    }
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    if (!canCreate) return;
    creating = true;
    createError = '';
    try {
      const r = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          type: cType,
          title: cTitle.trim(),
          description: cDescription.trim() || undefined,
          priority: cPriority,
          component: cComponent.trim() || undefined,
        }),
      });
      if (!r.ok) { const j = await r.json() as { error?: string }; throw new Error(j.error ?? 'Fehler'); }
      cTitle = ''; cDescription = ''; cComponent = '';
      showToast('Ticket angelegt.', true);
      await loadTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fehler';
      createError = msg;
    } finally {
      creating = false;
    }
  }

  async function changeStatus(ticketId: string, status: TicketStatus) {
    try {
      const r = await fetch(`/api/admin/tickets/${ticketId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // optimistic update
      tickets = tickets.map(t => t.id === ticketId ? { ...t, status } : t);
      showToast('Status geändert.', true);
    } catch {
      showToast('Status-Änderung fehlgeschlagen.', false);
    }
  }

  // Load on mount
  $effect(() => { loadTickets(); });

  const STATUS_LABELS: Record<TicketStatus, string> = {
    triage: 'Triage', backlog: 'Backlog', in_progress: 'In Arbeit',
    in_review: 'Review', blocked: 'Blockiert', done: 'Erledigt', archived: 'Archiviert',
  };
  const TYPE_LABELS: Record<TicketType, string> = {
    feature: 'Feature', task: 'Aufgabe', project: 'Projekt',
  };
  const PRIORITY_LABELS: Record<TicketPriority, string> = {
    hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig',
  };
</script>

<div class="view">
  <!-- Create accordion -->
  <section class="section">
    <button
      class="section-header"
      onclick={() => { createOpen = !createOpen; }}
      aria-expanded={createOpen}
    >
      <span class="section-title">+ Neues Ticket</span>
      <span class="chevron" class:rotated={createOpen}>›</span>
    </button>

    {#if createOpen}
      <form class="create-form" onsubmit={handleCreate}>
        <div class="row2">
          <div class="field">
            <label for="sk-type">Typ</label>
            <select id="sk-type" bind:value={cType}>
              {#each Object.entries(TYPE_LABELS) as [val, label]}
                <option value={val}>{label}</option>
              {/each}
            </select>
          </div>
          <div class="field">
            <label for="sk-prio">Priorität</label>
            <select id="sk-prio" bind:value={cPriority}>
              {#each Object.entries(PRIORITY_LABELS) as [val, label]}
                <option value={val}>{label}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="field">
          <label for="sk-title">Titel <span class="req">*</span></label>
          <input id="sk-title" type="text" bind:value={cTitle} maxlength="200" placeholder="Kurze Zusammenfassung" required />
        </div>
        <div class="field">
          <label for="sk-desc">Beschreibung</label>
          <textarea id="sk-desc" bind:value={cDescription} maxlength="2000" rows="2" placeholder="Details, Kontext…"></textarea>
        </div>
        <div class="field">
          <label for="sk-comp">Komponente</label>
          <input id="sk-comp" type="text" bind:value={cComponent} maxlength="100" placeholder="z.B. Chat, Auth" />
        </div>
        {#if createError}
          <p class="err">{createError}</p>
        {/if}
        <button type="submit" class="btn-primary" disabled={!canCreate}>
          {creating ? 'Wird angelegt…' : 'Anlegen'}
        </button>
      </form>
    {/if}
  </section>

  <!-- Ticket list -->
  <section class="section">
    <div class="list-header">
      <span class="section-title">Offene Anfragen</span>
      {#if !loading}
        <span class="count-badge">{tickets.length}</span>
      {/if}
    </div>

    {#if loading}
      {#each Array(3) as _}
        <div class="skeleton"></div>
      {/each}
    {:else if listError}
      <p class="err">{listError}</p>
    {:else if tickets.length === 0}
      <p class="empty">Keine offenen Tickets.</p>
    {:else}
      <ul class="ticket-list">
        {#each tickets as t (t.id)}
          <li class="ticket-row">
            <div class="ticket-meta">
              <span class="ext-id">{t.externalId ?? '–'}</span>
              <span class="type-pill">{TYPE_LABELS[t.type]}</span>
              <span class="prio-dot prio-{t.priority}" title={PRIORITY_LABELS[t.priority]}></span>
            </div>
            <p class="ticket-title">{t.title}</p>
            <div class="ticket-actions">
              <select
                value={t.status}
                onchange={(e) => changeStatus(t.id, (e.target as HTMLSelectElement).value as TicketStatus)}
              >
                {#each Object.entries(STATUS_LABELS) as [val, label]}
                  <option value={val}>{label}</option>
                {/each}
              </select>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Footer -->
  <a href="/admin/tickets" class="footer-link">Alle Anfragen →</a>

  <!-- Toast -->
  {#if toast}
    <div class="toast" class:toast-ok={toast.ok} class:toast-err={!toast.ok}>{toast.msg}</div>
  {/if}
</div>

<style>
  .view {
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
    overflow-y: auto;
    padding-bottom: 60px;
  }

  .section {
    border-bottom: 1px solid #1e2d42;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 14px 16px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: #e8e8f0;
  }
  .section-header:hover { background: rgba(255,255,255,0.03); }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    font-family: 'Geist Mono', monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #e8c870;
  }

  .chevron {
    font-size: 16px;
    color: #5566aa;
    transition: transform 0.15s;
    display: inline-block;
  }
  .chevron.rotated { transform: rotate(90deg); }

  .list-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px 8px;
  }

  .count-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(232,200,112,0.15);
    color: #e8c870;
    font-family: monospace;
  }

  .create-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 16px 16px;
  }

  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field label {
    font-size: 11px;
    font-weight: 500;
    color: #8899aa;
  }

  .req { color: #e8c870; }

  .field input,
  .field select,
  .field textarea {
    background: #0f1623;
    border: 1px solid #243049;
    border-radius: 6px;
    color: #e8e8f0;
    font-size: 12px;
    padding: 7px 9px;
    font-family: inherit;
    resize: vertical;
  }
  .field input:focus,
  .field select:focus,
  .field textarea:focus {
    outline: none;
    border-color: rgba(232,200,112,0.5);
  }

  .btn-primary {
    background: #e8c870;
    color: #0f1623;
    border: none;
    border-radius: 6px;
    font-weight: 700;
    font-size: 12px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 0.12s;
    align-self: flex-end;
  }
  .btn-primary:disabled { background: #2a3a52; color: #5566aa; cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { background: #f0d480; }

  .ticket-list {
    list-style: none;
    margin: 0;
    padding: 0 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ticket-row {
    background: #0f1623;
    border: 1px solid #1e2d42;
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ticket-row:hover { border-color: rgba(232,200,112,0.2); }

  .ticket-meta {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ext-id {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    color: #e8c870;
    font-weight: 600;
  }

  .type-pill {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255,255,255,0.06);
    color: #8899aa;
  }

  .prio-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-left: auto;
  }
  .prio-dot.prio-hoch { background: #ef4444; }
  .prio-dot.prio-mittel { background: #f59e0b; }
  .prio-dot.prio-niedrig { background: #6b7280; }

  .ticket-title {
    font-size: 12px;
    color: #c8d0e0;
    margin: 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .ticket-actions select {
    background: #0f1623;
    border: 1px solid #243049;
    border-radius: 5px;
    color: #8899aa;
    font-size: 11px;
    padding: 4px 6px;
    cursor: pointer;
    font-family: inherit;
  }
  .ticket-actions select:focus { outline: none; border-color: rgba(232,200,112,0.4); }

  .skeleton {
    height: 72px;
    background: linear-gradient(90deg, #1a2235 25%, #1e2a3f 50%, #1a2235 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 8px;
    margin: 0 16px 8px;
  }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  .empty { color: #5566aa; font-size: 12px; padding: 8px 16px 16px; margin: 0; }
  .err { color: #f87171; font-size: 11px; margin: 0; }

  .footer-link {
    display: block;
    position: sticky;
    bottom: 0;
    padding: 12px 16px;
    background: #0f1623;
    border-top: 1px solid #1e2d42;
    font-size: 12px;
    font-weight: 600;
    color: #e8c870;
    text-decoration: none;
    text-align: right;
  }
  .footer-link:hover { text-decoration: underline; }

  .toast {
    position: fixed;
    bottom: 80px;
    right: 16px;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    z-index: 100;
    pointer-events: none;
  }
  .toast-ok { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.25); }
  .toast-err { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
</style>
```

- [ ] **Step 2: Commit**

```bash
cd /tmp/wt-admin-sidekick-tickets-ui
git add website/src/components/assistant/TicketSidekickView.svelte
git commit -m "feat(sidekick): add TicketSidekickView — hybrid create form + open ticket list"
```

---

## Task 6: Create InboxSidekickView.svelte

**Files:**
- Create: `website/src/components/assistant/InboxSidekickView.svelte`

Note on actions: The inbox action endpoint (`POST /api/admin/inbox/:id/action`) is type-specific. For this Sidekick view, only `user_message` (→ `close_user_message`) and `contact` (→ `archive_contact`) support simple inline completion. Complex types (`registration`, `booking`, `bug`, `meeting_finalize`) show a "Im Postfach bearbeiten →" link instead of inline buttons — they require workflows (Keycloak, Talk rooms, etc.) that cannot run inline.

The type dot colors come from `src/components/inbox/type-meta.ts` — hardcoded here to avoid a dynamic import in the Sidekick.

- [ ] **Step 1: Create the file**

```svelte
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
    border-bottom: 1px solid #1e2d42;
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
    border: 1px solid #1e2d42;
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
    border-top: 1px solid #1e2d42;
    font-size: 12px;
    font-weight: 600;
    color: #e8c870;
    text-decoration: none;
    text-align: right;
  }
  .footer-link:hover { text-decoration: underline; }
</style>
```

- [ ] **Step 2: Commit**

```bash
cd /tmp/wt-admin-sidekick-tickets-ui
git add website/src/components/assistant/InboxSidekickView.svelte
git commit -m "feat(sidekick): add InboxSidekickView — pending items with inline actions + badge sync"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run offline test suite**

```bash
cd /tmp/wt-admin-sidekick-tickets-ui
task test:all 2>&1 | tail -20
```

Expected: all tests pass (this suite is offline — no cluster needed).

- [ ] **Step 2: Run TypeScript check on changed files**

```bash
cd /tmp/wt-admin-sidekick-tickets-ui/website
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

Expected: no errors on `PortalSidekick.svelte`, `SidekickHome.svelte`, `TicketSidekickView.svelte`, `InboxSidekickView.svelte`.

- [ ] **Step 3: Final commit and push**

```bash
cd /tmp/wt-admin-sidekick-tickets-ui
git status
git push -u origin feature/admin-sidekick-tickets-ui
```

- [ ] **Step 4: Open PR**

```bash
cd /tmp/wt-admin-sidekick-tickets-ui
gh pr create \
  --title "feat(admin): upgrade sidekick + remove ticket tab from Platform Hub" \
  --body "$(cat <<'EOF'
## Summary
- Removes duplicate Tickets tab from Platform Control Center; Hub now opens on GitOps by default
- Visual upgrade of Multi-Sidekick: SVG bell FAB, mono-font header with gold border, admin-var CSS throughout
- New Sidekick Ticket view: collapsible create form + 7 open tickets with status dropdown
- New Sidekick Inbox view: type-filter pills + 5 pending items with inline done/archive actions + badge sync via existing admin-inbox-changed event

## Test plan
- [ ] Open `/admin/platform` — no Tickets tab, GitOps loads by default
- [ ] Click Sidekick FAB — gold bell SVG, no emoji
- [ ] Open Sidekick in Admin — see Anfragen + Postfach cards at top of home
- [ ] Navigate to Tickets view — create form works, list shows open tickets, status dropdown updates on change
- [ ] Navigate to Inbox view — shows pending items, ✓ Erledigt removes item and sidebar badge updates
- [ ] Open Portal (non-admin) — Sidekick shows only Fragebögen, Feedback, Hilfe (no admin cards)
EOF
)"
```

- [ ] **Step 5: Merge**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 6: Deploy website to both clusters**

```bash
task feature:website
```

Expected: both `web.mentolder.de` and `web.korczewski.de` updated.
