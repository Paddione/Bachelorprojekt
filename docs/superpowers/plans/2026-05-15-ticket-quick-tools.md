---
ticket_id: T000385
title: Ticket Quick Tools Implementation Plan
domains: []
status: active
pr_number: null
---

# Ticket Quick Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `BugReportWidget` and `HelpPanel` with two focused Ticket-Widgets — `TicketQuickCreate` (modal, all types, admin-aware) and `TicketQuickEdit` (slide-over, search + inline edit for admin, comment-only for portal) — positioned side by side in the bottom-right corner.

**Architecture:** Three new components (`TicketWidgetBar.astro` wrapper + two Svelte widgets) replace the two existing ones; `TicketWidgetBar` is wired into `AdminLayout`, `PortalLayout`, and `stripe/success.astro`. A new public API endpoint `/api/tickets/comment` backs the portal-side comment form in `TicketQuickEdit`. All existing APIs (`/api/bug-report`, `/api/admin/tickets/*`) remain unchanged.

**Tech Stack:** Svelte 5 (runes), Astro, TypeScript, Tailwind CSS, PostgreSQL via existing `tickets/admin.ts` helpers.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `website/src/pages/api/tickets/comment.ts` | Public rate-limited comment/feedback endpoint |
| Create | `website/src/components/TicketWidgetBar.astro` | Positions both buttons side by side, passes `context` + `showEdit` props |
| Create | `website/src/components/TicketQuickCreate.svelte` | Create modal — admin (all types) or portal (bug-report form) |
| Create | `website/src/components/TicketQuickEdit.svelte` | Slide-over — admin (search + inline edit) or portal (comment form) |
| Modify | `website/src/layouts/AdminLayout.astro` | Swap BugReportWidget + HelpPanel → TicketWidgetBar |
| Modify | `website/src/layouts/PortalLayout.astro` | Swap HelpPanel → TicketWidgetBar |
| Modify | `website/src/pages/stripe/success.astro` | Swap BugReportWidget → TicketQuickCreate |

---

## Task 1: Public Comment API Endpoint

**Files:**
- Create: `website/src/pages/api/tickets/comment.ts`

This endpoint lets unauthenticated portal users either add a public comment to an existing ticket (by external ID like `T000301`) or create an anonymous feedback task ticket.

- [ ] **Step 1: Create the endpoint**

```typescript
// website/src/pages/api/tickets/comment.ts
import type { APIRoute } from 'astro';
import { addComment, createAdminTicket } from '../../../lib/tickets/admin';
import { checkRateLimit, getClientIp } from '../../../lib/rate-limit';
import { config } from '../../../config/index.js';
import { pool } from '../../../lib/website-db';

const BRAND = config.brand;
const EXTERNAL_ID_RE = /^T\d{6}$/i;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`ticket-comment:${ip}`, 5, 60_000)) {
    return jsonError('Zu viele Anfragen. Bitte warten Sie einen Moment.', 429);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Ungültiger JSON-Body.', 400); }

  const comment = String(body.comment ?? '').trim();
  if (!comment) return jsonError('Kommentar ist erforderlich.', 400);
  if (comment.length > 1000) return jsonError('Kommentar zu lang (max. 1000 Zeichen).', 400);

  const rawId = typeof body.ticketId === 'string' ? body.ticketId.trim().toUpperCase() : '';
  const ticketExternalId = EXTERNAL_ID_RE.test(rawId) ? rawId : undefined;

  try {
    if (ticketExternalId) {
      const row = await pool.query<{ id: string }>(
        `SELECT id FROM tickets.tickets WHERE external_id = $1 AND brand = $2`,
        [ticketExternalId, BRAND]
      );
      if (row.rows.length === 0) {
        return jsonError('Ticket nicht gefunden.', 404);
      }
      await addComment({
        brand: BRAND,
        ticketId: row.rows[0].id,
        body: comment,
        visibility: 'public',
        actor: { label: 'Portal-Nutzer' },
      });
    } else {
      await createAdminTicket({
        brand: BRAND,
        type: 'task',
        title: 'Portal-Feedback',
        description: comment,
        priority: 'niedrig',
        actor: { label: 'Portal-Nutzer' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/tickets/comment]', err);
    return jsonError('Interner Fehler. Bitte versuchen Sie es erneut.', 500);
  }
};
```

- [ ] **Step 2: Verify the endpoint exists and the dev server accepts it**

```bash
cd /home/patrick/Bachelorprojekt
task website:dev &
sleep 5
curl -s -X POST http://localhost:4321/api/tickets/comment \
  -H 'Content-Type: application/json' \
  -d '{"comment":"test"}' | jq .
# Expected: { "ok": true } or a DB error (no DB in dev) — NOT a 404
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/tickets/comment.ts
git commit -m "feat(tickets): add public comment/feedback endpoint"
```

---

## Task 2: TicketWidgetBar Wrapper

**Files:**
- Create: `website/src/components/TicketWidgetBar.astro`

A thin Astro component that positions both widget buttons in a horizontal row at `bottom-6 right-6`. Accepts `context: 'admin' | 'portal'` and `showEdit: boolean`.

- [ ] **Step 1: Create the wrapper**

```astro
---
// website/src/components/TicketWidgetBar.astro
import TicketQuickCreate from './TicketQuickCreate.svelte';
import TicketQuickEdit from './TicketQuickEdit.svelte';

interface Props {
  context?: 'admin' | 'portal';
  showEdit?: boolean;
}

const { context = 'portal', showEdit = false } = Astro.props;
---

<div class="fixed bottom-6 right-6 z-40 flex items-center gap-2">
  {showEdit && (
    <TicketQuickEdit client:load context={context} />
  )}
  <TicketQuickCreate client:load context={context} />
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/TicketWidgetBar.astro
git commit -m "feat(tickets): add TicketWidgetBar layout wrapper"
```

---

## Task 3: TicketQuickCreate Component

**Files:**
- Create: `website/src/components/TicketQuickCreate.svelte`

Modal that renders two different forms depending on `context`:
- `admin` → full form with type/title/description/priority/component, posts to `/api/admin/tickets`
- `portal` → existing bug-report form (category/email/description/screenshots), posts to `/api/bug-report`

The trigger button is **not** `fixed` — positioning is handled by `TicketWidgetBar`. When used standalone (e.g. `stripe/success.astro`), wrap in a `fixed bottom-6 right-6` div.

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  type Context = 'admin' | 'portal';
  type TicketType = 'bug' | 'feature' | 'task' | 'project';
  type Priority = 'hoch' | 'mittel' | 'niedrig';
  type BugCategory = 'fehler' | 'verbesserung' | 'erweiterungswunsch' | 'zahlung';

  let {
    context = 'portal',
    defaultCategory = 'verbesserung',
  }: { context?: Context; defaultCategory?: BugCategory } = $props();

  let open = $state(false);
  let submitting = $state(false);
  let result = $state<{ success: boolean; message: string } | null>(null);

  // Admin-form state
  let adminType = $state<TicketType>('bug');
  let adminTitle = $state('');
  let adminDescription = $state('');
  let adminPriority = $state<Priority>('mittel');
  let adminComponent = $state('');

  // Portal-form state (mirrors BugReportWidget)
  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_FILES = 3;
  const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let portalEmail = $state('');
  let portalCategory = $state<BugCategory>(defaultCategory);
  let portalDescription = $state('');
  let portalFiles = $state<File[]>([]);
  let fileError = $state('');
  let fileInputEl = $state<HTMLInputElement | null>(null);

  let triggerButtonEl = $state<HTMLButtonElement | null>(null);
  let dialogEl = $state<HTMLDivElement | null>(null);

  function openModal() { open = true; result = null; }
  function closeModal() { if (submitting) return; open = false; }

  function resetAdminForm() {
    adminType = 'bug'; adminTitle = ''; adminDescription = '';
    adminPriority = 'mittel'; adminComponent = ''; result = null;
  }

  function resetPortalForm() {
    portalEmail = ''; portalCategory = defaultCategory;
    portalDescription = ''; portalFiles = []; fileError = ''; result = null;
    if (fileInputEl) fileInputEl.value = '';
  }

  function onFileChange(e: Event) {
    fileError = '';
    const input = e.target as HTMLInputElement;
    if (!input.files) return;
    for (const picked of Array.from(input.files)) {
      if (portalFiles.length >= MAX_FILES) { fileError = `Maximal ${MAX_FILES} Screenshots.`; break; }
      if (picked.size > MAX_BYTES) { fileError = `"${picked.name}" zu groß (max. 5 MB).`; continue; }
      if (!ALLOWED_MIME.includes(picked.type)) { fileError = `"${picked.name}": nur PNG, JPEG, WEBP.`; continue; }
      if (portalFiles.some(f => f.name === picked.name && f.size === picked.size)) { fileError = `"${picked.name}" bereits hinzugefügt.`; continue; }
      portalFiles = [...portalFiles, picked];
    }
    input.value = '';
  }

  function removeFile(i: number) { portalFiles = portalFiles.filter((_, idx) => idx !== i); fileError = ''; }

  const adminCanSubmit = $derived(
    adminTitle.trim().length > 0 && !submitting
  );

  const portalCanSubmit = $derived(
    portalDescription.trim().length > 0 &&
    EMAIL_RE.test(portalEmail) &&
    !submitting && !fileError
  );

  async function submitAdmin(e: Event) {
    e.preventDefault();
    if (!adminCanSubmit) return;
    submitting = true; result = null;
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: adminType,
          title: adminTitle.trim(),
          description: adminDescription.trim() || undefined,
          priority: adminPriority,
          component: adminComponent.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // Fetch external_id (T######) — POST returns UUID only
        let externalId = '';
        if (data.id) {
          const detail = await fetch(`/api/admin/tickets/${data.id}`).then(r => r.json()).catch(() => null);
          externalId = detail?.ticket?.externalId ?? '';
        }
        result = { success: true, message: `Ticket angelegt${externalId ? ` (${externalId})` : ''}.` };
        resetAdminForm();
        setTimeout(() => { open = false; result = null; }, 2000);
      } else {
        result = { success: false, message: data.error ?? 'Fehler beim Anlegen.' };
      }
    } catch { result = { success: false, message: 'Verbindungsfehler.' }; }
    finally { submitting = false; }
  }

  async function submitPortal(e: Event) {
    e.preventDefault();
    if (!portalCanSubmit) return;
    submitting = true; result = null;
    const fd = new FormData();
    fd.append('description', portalDescription.trim());
    fd.append('email', portalEmail.trim());
    fd.append('category', portalCategory);
    fd.append('url', window.location.href);
    fd.append('userAgent', navigator.userAgent);
    fd.append('viewport', `${window.innerWidth}x${window.innerHeight}`);
    for (const file of portalFiles) fd.append('screenshot', file, file.name);
    try {
      const res = await fetch('/api/bug-report', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        const tid = data.ticketId ?? '';
        result = { success: true, message: tid ? `Meldung als ${tid} aufgenommen.` : 'Vielen Dank! Meldung übermittelt.' };
        resetPortalForm();
        setTimeout(() => { open = false; result = null; }, 2000);
      } else {
        result = { success: false, message: data.error ?? 'Fehler beim Übermitteln.' };
      }
    } catch { result = { success: false, message: 'Verbindungsfehler.' }; }
    finally { submitting = false; }
  }

  function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && open) closeModal(); }

  let effectInitialized = false;
  $effect(() => {
    const isOpen = open;
    if (!effectInitialized) { effectInitialized = true; return; }
    if (isOpen && dialogEl) {
      dialogEl.querySelector<HTMLElement>('input,textarea,select,button')?.focus();
    } else if (!isOpen && triggerButtonEl) {
      triggerButtonEl.focus();
    }
  });

  const TYPE_LABELS: Record<TicketType, string> = {
    bug: 'Bug', feature: 'Feature', task: 'Aufgabe', project: 'Projekt',
  };
  const PRIORITY_LABELS: Record<Priority, string> = {
    hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig',
  };
</script>

<svelte:window onkeydown={onKeydown} />

<button
  type="button"
  bind:this={triggerButtonEl}
  onclick={openModal}
  aria-label={context === 'admin' ? 'Ticket erstellen' : 'Fehler melden'}
  class="flex items-center gap-2 bg-gold hover:bg-gold-light text-dark px-4 py-3 rounded-full font-semibold shadow-lg transition-colors cursor-pointer"
>
  <span aria-hidden="true">+</span>
  <span>{context === 'admin' ? 'Ticket erstellen' : 'Fehler melden'}</span>
</button>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    onclick={closeModal}
  >
    <div
      bind:this={dialogEl}
      class="bg-dark border border-dark-lighter rounded-xl max-w-lg w-full p-6 shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tqc-modal-title"
    >
      <div class="flex items-start justify-between mb-4">
        <h2 id="tqc-modal-title" class="text-xl font-bold text-light">
          {context === 'admin' ? 'Neues Ticket' : 'Fehler melden'}
        </h2>
        <button
          type="button"
          onclick={closeModal}
          aria-label="Schließen"
          class="text-muted hover:text-light text-2xl leading-none cursor-pointer bg-transparent border-0"
        >×</button>
      </div>

      {#if context === 'admin'}
        <!-- Admin form -->
        <form onsubmit={submitAdmin} class="space-y-4">
          <div>
            <label for="tqc-type" class="block text-sm font-medium text-light mb-1">
              Typ <span class="text-gold">*</span>
            </label>
            <select
              id="tqc-type"
              bind:value={adminType}
              class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
            >
              {#each Object.entries(TYPE_LABELS) as [val, label]}
                <option value={val}>{label}</option>
              {/each}
            </select>
          </div>

          <div>
            <label for="tqc-title" class="block text-sm font-medium text-light mb-1">
              Titel <span class="text-gold">*</span>
            </label>
            <input
              id="tqc-title"
              type="text"
              bind:value={adminTitle}
              maxlength="200"
              required
              placeholder="Kurze Zusammenfassung"
              class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
            />
          </div>

          <div>
            <label for="tqc-desc" class="block text-sm font-medium text-light mb-1">
              Beschreibung
            </label>
            <textarea
              id="tqc-desc"
              bind:value={adminDescription}
              maxlength="2000"
              rows="4"
              placeholder="Details, Kontext, Reproduktionsschritte…"
              class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim resize-y"
            ></textarea>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="tqc-priority" class="block text-sm font-medium text-light mb-1">Priorität</label>
              <select
                id="tqc-priority"
                bind:value={adminPriority}
                class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
              >
                {#each Object.entries(PRIORITY_LABELS) as [val, label]}
                  <option value={val}>{label}</option>
                {/each}
              </select>
            </div>
            <div>
              <label for="tqc-component" class="block text-sm font-medium text-light mb-1">Komponente</label>
              <input
                id="tqc-component"
                type="text"
                bind:value={adminComponent}
                maxlength="100"
                placeholder="z.B. Chat, Auth"
                class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!adminCanSubmit}
            class="w-full bg-gold hover:bg-gold-light disabled:bg-dark-lighter disabled:text-muted-dark text-dark px-4 py-2.5 rounded font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {submitting ? 'Wird angelegt…' : 'Ticket anlegen'}
          </button>

          {#if result}
            <div class="p-3 rounded text-sm {result.success ? 'bg-green-900/30 text-green-300 border border-green-800' : 'bg-red-900/30 text-red-300 border border-red-800'}">
              {result.message}
            </div>
          {/if}
        </form>

      {:else}
        <!-- Portal form (identical to legacy BugReportWidget) -->
        <form onsubmit={submitPortal} class="space-y-4">
          <div>
            <label for="tqc-email" class="block text-sm font-medium text-light mb-1">
              Ihre E-Mail <span class="text-gold">*</span>
            </label>
            <input
              id="tqc-email"
              type="email"
              bind:value={portalEmail}
              required
              placeholder="max@example.com"
              class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
            />
          </div>

          <div>
            <label for="tqc-category" class="block text-sm font-medium text-light mb-1">
              Kategorie <span class="text-gold">*</span>
            </label>
            <select
              id="tqc-category"
              bind:value={portalCategory}
              class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
            >
              <option value="verbesserung">Verbesserungsvorschlag</option>
              <option value="erweiterungswunsch">Idee / Wunsch</option>
              <option value="fehler">Problem / Fehler melden</option>
              <option value="zahlung">Zahlungsproblem</option>
            </select>
          </div>

          <div>
            <label for="tqc-portal-desc" class="block text-sm font-medium text-light mb-1">
              Beschreibung <span class="text-gold">*</span>
            </label>
            <textarea
              id="tqc-portal-desc"
              bind:value={portalDescription}
              maxlength="2000"
              rows="5"
              required
              placeholder="Was ist passiert? Was haben Sie erwartet?"
              class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim resize-y"
            ></textarea>
          </div>

          <div>
            <label for="tqc-screenshot" class="block text-sm font-medium text-light mb-1">
              Screenshots <span class="text-muted-dark">(optional, bis zu 3, max. 5 MB)</span>
            </label>
            {#if portalFiles.length < 3}
              <input
                id="tqc-screenshot"
                bind:this={fileInputEl}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onchange={onFileChange}
                class="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-gold file:text-dark file:font-semibold hover:file:bg-gold-light cursor-pointer"
              />
            {/if}
            {#if portalFiles.length > 0}
              <ul class="mt-2 space-y-1">
                {#each portalFiles as file, i}
                  <li class="text-xs text-muted flex items-center gap-2">
                    <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                    <button type="button" onclick={() => removeFile(i)} class="text-gold hover:underline bg-transparent border-0 cursor-pointer">Entfernen</button>
                  </li>
                {/each}
              </ul>
            {/if}
            {#if fileError}
              <p class="text-xs text-red-400 mt-1">{fileError}</p>
            {/if}
          </div>

          <button
            type="submit"
            disabled={!portalCanSubmit}
            class="w-full bg-gold hover:bg-gold-light disabled:bg-dark-lighter disabled:text-muted-dark text-dark px-4 py-2.5 rounded font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {submitting ? 'Wird gesendet…' : 'Meldung senden'}
          </button>

          {#if result}
            <div class="p-3 rounded text-sm {result.success ? 'bg-green-900/30 text-green-300 border border-green-800' : 'bg-red-900/30 text-red-300 border border-red-800'}">
              {result.message}
            </div>
          {/if}
        </form>
      {/if}
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/TicketQuickCreate.svelte
git commit -m "feat(tickets): add TicketQuickCreate component (admin + portal)"
```

---

## Task 4: TicketQuickEdit Component

**Files:**
- Create: `website/src/components/TicketQuickEdit.svelte`

Slide-over panel (320 px, from right). In `admin` context: search input + recent tickets list + inline edit view. In `portal` context: simple comment form only.

**Admin edit fields:**
- Status: dropdown — only non-terminal statuses (`triage`, `backlog`, `in_progress`, `in_review`, `blocked`). Terminal transitions (`done`/`archived`) require a resolution and belong on the full detail page.
- Priority: 3-button toggle (hoch/mittel/niedrig)
- Komponente: text input
- Notizen: textarea (internal)

Autosave: `onblur` for each field → PATCH/transition immediately → show ✓ or error inline. On panel close, blur any focused element first (triggers save), then close after 50 ms.

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  type Context = 'admin' | 'portal';
  type TicketStatus = 'triage' | 'backlog' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'archived';
  type Priority = 'hoch' | 'mittel' | 'niedrig';

  interface TicketSummary {
    id: string;
    externalId: string | null;
    type: string;
    title: string;
    status: TicketStatus;
    priority: Priority;
    component: string | null;
  }

  interface TicketFull extends TicketSummary {
    notes: string | null;
  }

  let { context = 'portal' }: { context?: Context } = $props();

  let open = $state(false);
  let panelEl = $state<HTMLDivElement | null>(null);
  let btnEl = $state<HTMLButtonElement | null>(null);
  let btnHovered = $state(false);

  // Admin — list/search view
  let query = $state('');
  let recentTickets = $state<TicketSummary[]>([]);
  let searchResults = $state<TicketSummary[]>([]);
  let loadingList = $state(false);

  // Admin — edit view
  let selectedTicket = $state<TicketFull | null>(null);
  let editStatus = $state<TicketStatus>('triage');
  let editPriority = $state<Priority>('mittel');
  let editComponent = $state('');
  let editNotes = $state('');
  let savingField = $state<string | null>(null);
  let savedField = $state<string | null>(null);
  let fieldError = $state<string | null>(null);

  // Portal — comment form
  let portalTicketId = $state('');
  let portalComment = $state('');
  let portalSubmitting = $state(false);
  let portalResult = $state<{ success: boolean; message: string } | null>(null);

  const QUICK_STATUSES: { value: TicketStatus; label: string }[] = [
    { value: 'triage',      label: 'Triage' },
    { value: 'backlog',     label: 'Backlog' },
    { value: 'in_progress', label: 'In Arbeit' },
    { value: 'in_review',   label: 'In Review' },
    { value: 'blocked',     label: 'Blockiert' },
  ];

  const TYPE_BADGE: Record<string, string> = {
    bug: 'bg-red-900/40 text-red-300',
    feature: 'bg-blue-900/40 text-blue-300',
    task: 'bg-yellow-900/40 text-yellow-300',
    project: 'bg-purple-900/40 text-purple-300',
  };

  function openPanel() {
    open = true;
    if (context === 'admin') loadRecent();
  }

  function closePanel() {
    if (panelEl) {
      const focused = panelEl.querySelector<HTMLElement>(':focus');
      if (focused) {
        focused.blur();
        setTimeout(() => { open = false; selectedTicket = null; query = ''; }, 80);
        return;
      }
    }
    open = false;
    selectedTicket = null;
    query = '';
  }

  async function loadRecent() {
    loadingList = true;
    try {
      const res = await fetch('/api/admin/tickets?status=open&limit=5');
      if (res.ok) {
        const data = await res.json();
        recentTickets = data.items ?? [];
      }
    } finally { loadingList = false; }
  }

  let searchTimer: ReturnType<typeof setTimeout>;
  function onQueryInput() {
    clearTimeout(searchTimer);
    if (query.length < 2) { searchResults = []; return; }
    searchTimer = setTimeout(async () => {
      const res = await fetch(`/api/admin/tickets?q=${encodeURIComponent(query)}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        searchResults = data.items ?? [];
      }
    }, 300);
  }

  async function selectTicket(t: TicketSummary) {
    const res = await fetch(`/api/admin/tickets/${t.id}`);
    if (!res.ok) return;
    const data = await res.json();
    const ticket = data.ticket;
    selectedTicket = {
      id: ticket.id,
      externalId: ticket.externalId,
      type: ticket.type,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      component: ticket.component ?? null,
      notes: ticket.notes ?? null,
    };
    editStatus = ticket.status;
    editPriority = ticket.priority;
    editComponent = ticket.component ?? '';
    editNotes = ticket.notes ?? '';
    savedField = null;
    fieldError = null;
  }

  async function saveStatus() {
    if (!selectedTicket || editStatus === selectedTicket.status) return;
    savingField = 'status'; fieldError = null;
    const prev = selectedTicket.status;
    try {
      const res = await fetch(`/api/admin/tickets/${selectedTicket.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: editStatus }),
      });
      if (res.ok) {
        selectedTicket = { ...selectedTicket, status: editStatus };
        savedField = 'status';
        setTimeout(() => { savedField = null; }, 2000);
      } else {
        const d = await res.json();
        fieldError = d.error ?? 'Fehler beim Speichern.';
        editStatus = prev;
      }
    } catch {
      fieldError = 'Verbindungsfehler.';
      editStatus = prev;
    } finally { savingField = null; }
  }

  async function saveField(field: 'priority' | 'component' | 'notes', value: string | Priority) {
    if (!selectedTicket) return;
    savingField = field; fieldError = null;
    try {
      const res = await fetch(`/api/admin/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      });
      if (res.ok) {
        selectedTicket = { ...selectedTicket, [field]: value || null } as TicketFull;
        savedField = field;
        setTimeout(() => { savedField = null; }, 2000);
      } else {
        const d = await res.json();
        fieldError = d.error ?? 'Fehler beim Speichern.';
      }
    } catch { fieldError = 'Verbindungsfehler.'; }
    finally { savingField = null; }
  }

  async function submitPortalComment(e: Event) {
    e.preventDefault();
    if (!portalComment.trim()) return;
    portalSubmitting = true; portalResult = null;
    try {
      const res = await fetch('/api/tickets/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: portalComment.trim(),
          ticketId: portalTicketId.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        portalResult = { success: true, message: 'Feedback übermittelt. Danke!' };
        portalComment = ''; portalTicketId = '';
        setTimeout(() => { portalResult = null; }, 2500);
      } else {
        portalResult = { success: false, message: data.error ?? 'Fehler beim Senden.' };
      }
    } catch {
      portalResult = { success: false, message: 'Verbindungsfehler.' };
    } finally { portalSubmitting = false; }
  }

  function onWindowKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && open) closePanel(); }

  const displayedList = $derived(query.length >= 2 ? searchResults : recentTickets);
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- Trigger button (positioned by TicketWidgetBar) -->
<button
  bind:this={btnEl}
  type="button"
  onclick={openPanel}
  aria-label={open ? 'Ticket-Panel schließen' : 'Ticket bearbeiten'}
  style="
    width: 40px; height: 40px; border-radius: 50%;
    background: {btnHovered ? '#4338ca' : '#4f46e5'};
    color: #fff; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(79,70,229,.45);
    font-size: 16px; transition: background 0.15s ease;
  "
  onmouseenter={() => { btnHovered = true; }}
  onmouseleave={() => { btnHovered = false; }}
>✏️</button>

<!-- Slide-over Panel -->
<div
  bind:this={panelEl}
  role="dialog"
  aria-modal="true"
  aria-labelledby="tqe-panel-title"
  aria-hidden={!open}
  inert={!open}
  style="
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 62;
    width: 320px;
    background: var(--ink-850, #1a1a2e);
    border-left: 1px solid var(--line, #2a2a3e);
    box-shadow: -4px 0 24px rgba(0,0,0,.35);
    display: flex; flex-direction: column;
    transform: translateX({open ? '0' : '100%'});
    transition: transform 0.2s ease-out; overflow: hidden;
  "
>
  <!-- Header -->
  <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 16px 14px; border-bottom:1px solid var(--line,#2a2a3e); flex-shrink:0;">
    <span id="tqe-panel-title" style="font-size:14px; font-weight:600; color:var(--fg,#e2e8f0); font-family:var(--font-sans);">
      {context === 'admin' ? 'Ticket bearbeiten' : 'Feedback senden'}
    </span>
    <button
      onclick={closePanel}
      aria-label="Panel schließen"
      style="background:none; border:none; cursor:pointer; color:var(--mute,#64748b); font-size:18px; line-height:1; padding:2px 4px; border-radius:4px;"
    >✕</button>
  </div>

  <!-- Body -->
  <div style="flex:1; overflow-y:auto; padding:16px;">

    {#if context === 'admin'}
      {#if selectedTicket}
        <!-- Edit view -->
        <button
          onclick={() => { selectedTicket = null; query = ''; }}
          style="font-size:12px; color:#818cf8; background:none; border:none; cursor:pointer; padding:0 0 12px; display:flex; align-items:center; gap:4px;"
        >← Zurück</button>

        <div style="margin-bottom:12px;">
          <span style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); padding:2px 6px; border-radius:4px;" class="{TYPE_BADGE[selectedTicket.type] ?? 'bg-gray-900/40 text-gray-300'}">{selectedTicket.type}</span>
          <p style="font-size:13px; font-weight:600; color:var(--fg,#e2e8f0); margin:6px 0 0; line-height:1.4;">
            {selectedTicket.externalId ?? ''} — {selectedTicket.title}
          </p>
        </div>

        {#if fieldError}
          <p style="font-size:12px; color:#f87171; margin:0 0 8px; padding:6px 8px; background:rgba(239,68,68,.1); border-radius:4px;">{fieldError}</p>
        {/if}

        <!-- Status -->
        <div style="margin-bottom:12px;">
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Status</label>
          <select
            bind:value={editStatus}
            onchange={saveStatus}
            style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:rgba(79,70,229,.08); color:var(--fg,#e2e8f0); font-size:13px; cursor:pointer;"
          >
            {#each QUICK_STATUSES as s}
              <option value={s.value}>{s.label}{savingField === 'status' && editStatus === s.value ? ' …' : ''}{savedField === 'status' && selectedTicket.status === s.value ? ' ✓' : ''}</option>
            {/each}
          </select>
        </div>

        <!-- Priority -->
        <div style="margin-bottom:12px;">
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Priorität {savedField === 'priority' ? '✓' : ''}</label>
          <div style="display:flex; gap:4px;">
            {#each (['hoch','mittel','niedrig'] as Priority[]) as p}
              <button
                type="button"
                onclick={() => { editPriority = p; saveField('priority', p); }}
                style="flex:1; padding:5px 0; border-radius:5px; border:1px solid {editPriority === p ? '#4f46e5' : 'var(--line,#2a2a3e)'}; background:{editPriority === p ? 'rgba(79,70,229,.2)' : 'transparent'}; color:{editPriority === p ? '#818cf8' : 'var(--mute,#64748b)'}; font-size:12px; cursor:pointer; transition:all 0.1s ease;"
              >{p.charAt(0).toUpperCase() + p.slice(1)}</button>
            {/each}
          </div>
        </div>

        <!-- Component -->
        <div style="margin-bottom:12px;">
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Komponente {savedField === 'component' ? '✓' : ''}</label>
          <input
            type="text"
            bind:value={editComponent}
            onblur={() => saveField('component', editComponent)}
            maxlength="100"
            placeholder="z.B. Chat, Auth…"
            style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; color:var(--fg,#e2e8f0); font-size:13px; box-sizing:border-box;"
          />
        </div>

        <!-- Notes -->
        <div>
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Notizen (intern) {savedField === 'notes' ? '✓' : ''}</label>
          <textarea
            bind:value={editNotes}
            onblur={() => saveField('notes', editNotes)}
            maxlength="1000"
            rows="4"
            placeholder="Interne Anmerkungen…"
            style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; color:var(--fg,#e2e8f0); font-size:13px; resize:vertical; box-sizing:border-box;"
          ></textarea>
        </div>

        <a
          href="/admin/tickets/{selectedTicket.id}"
          style="display:block; margin-top:12px; font-size:12px; color:#818cf8; text-align:center;"
        >Vollständige Ansicht →</a>

      {:else}
        <!-- List/Search view -->
        <input
          type="search"
          bind:value={query}
          oninput={onQueryInput}
          placeholder="Ticket-ID oder Stichwort…"
          style="width:100%; padding:7px 10px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; color:var(--fg,#e2e8f0); font-size:13px; margin-bottom:12px; box-sizing:border-box;"
          aria-label="Ticket suchen"
        />

        {#if loadingList}
          <p style="font-size:12px; color:var(--mute,#64748b);">Lade…</p>
        {:else if displayedList.length === 0 && query.length >= 2}
          <p style="font-size:12px; color:var(--mute,#64748b);">Kein Ticket gefunden.</p>
        {:else}
          <p style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); margin:0 0 6px;">
            {query.length >= 2 ? 'Suchergebnisse' : 'Zuletzt aktualisiert'}
          </p>
          <ul style="margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:4px;">
            {#each displayedList as ticket}
              <li>
                <button
                  type="button"
                  onclick={() => selectTicket(ticket)}
                  style="width:100%; text-align:left; padding:8px 10px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; cursor:pointer; transition:background 0.1s ease;"
                  onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(79,70,229,.08)'; }}
                  onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span style="font-size:11px; color:#818cf8; display:block;">{ticket.externalId ?? ticket.id.slice(0,8)}</span>
                  <span style="font-size:13px; color:var(--fg,#e2e8f0); display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{ticket.title}</span>
                  <span style="font-size:11px; color:var(--mute,#64748b);">{ticket.status}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}

    {:else}
      <!-- Portal: comment form -->
      <form onsubmit={submitPortalComment} style="display:flex; flex-direction:column; gap:12px;">
        <p style="font-size:13px; color:var(--fg-soft,#94a3b8); margin:0;">Haben Sie Feedback zu einer Meldung?</p>

        <div>
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Ticket-ID (optional)</label>
          <input
            type="text"
            bind:value={portalTicketId}
            placeholder="T000301"
            maxlength="10"
            style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; color:var(--fg,#e2e8f0); font-size:13px; box-sizing:border-box;"
          />
        </div>

        <div>
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Kommentar <span style="color:#f59e0b;">*</span></label>
          <textarea
            bind:value={portalComment}
            required
            maxlength="1000"
            rows="5"
            placeholder="Ihre Rückmeldung…"
            style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; color:var(--fg,#e2e8f0); font-size:13px; resize:vertical; box-sizing:border-box;"
          ></textarea>
        </div>

        <button
          type="submit"
          disabled={portalSubmitting || !portalComment.trim()}
          style="padding:8px 0; border-radius:6px; background:#4f46e5; color:#fff; border:none; cursor:pointer; font-size:13px; font-weight:600; transition:background 0.15s ease; opacity:{portalSubmitting || !portalComment.trim() ? '0.5' : '1'};"
        >{portalSubmitting ? 'Wird gesendet…' : 'Feedback senden'}</button>

        {#if portalResult}
          <p style="font-size:12px; padding:8px; border-radius:6px; {portalResult.success ? 'background:rgba(34,197,94,.1); color:#86efac;' : 'background:rgba(239,68,68,.1); color:#fca5a5;'}">{portalResult.message}</p>
        {/if}
      </form>
    {/if}
  </div>
</div>

<style>
  @media (max-width: 639px) {
    div[role="dialog"] {
      width: 100vw !important;
    }
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/TicketQuickEdit.svelte
git commit -m "feat(tickets): add TicketQuickEdit slide-over component"
```

---

## Task 5: Wire Into Layouts

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`
- Modify: `website/src/layouts/PortalLayout.astro`
- Modify: `website/src/pages/stripe/success.astro`

- [ ] **Step 1: Update AdminLayout.astro**

Find this block (around line 393–398):
```astro
    {ASSISTANT_ENABLED ? (
      <AssistantWidget client:load profile="admin" />
    ) : (
      <HelpPanel client:load section={helpSection} context="admin" />
    )}
    <BugReportWidget client:load />
```

Replace with:
```astro
    {ASSISTANT_ENABLED ? (
      <AssistantWidget client:load profile="admin" />
    ) : null}
    <TicketWidgetBar context="admin" showEdit={!ASSISTANT_ENABLED} />
```

Also update the imports at the top — remove `BugReportWidget` and `HelpPanel`, add `TicketWidgetBar`:
```astro
// Remove:
import BugReportWidget from '../components/BugReportWidget.svelte';
import HelpPanel from '../components/HelpPanel.svelte';
// Add:
import TicketWidgetBar from '../components/TicketWidgetBar.astro';
```

- [ ] **Step 2: Update PortalLayout.astro**

Find this block (around line 263–266):
```astro
    {ASSISTANT_ENABLED ? (
      <AssistantWidget client:load profile="portal" />
    ) : (
      <HelpPanel client:load section={section} context="portal" />
    )}
```

Replace with:
```astro
    {ASSISTANT_ENABLED ? (
      <AssistantWidget client:load profile="portal" />
    ) : null}
    <TicketWidgetBar context="portal" showEdit={!ASSISTANT_ENABLED} />
```

Update imports — remove `HelpPanel`, add `TicketWidgetBar`:
```astro
// Remove:
import HelpPanel from '../components/HelpPanel.svelte';
// Add:
import TicketWidgetBar from '../components/TicketWidgetBar.astro';
```

- [ ] **Step 3: Update stripe/success.astro**

`stripe/success.astro` uses the base `Layout.astro` (not AdminLayout/PortalLayout) and embeds `BugReportWidget` directly. Since the button positioning is handled externally in the layouts, here we wrap directly.

Find:
```astro
import BugReportWidget from '../../components/BugReportWidget.svelte';
```
Replace with:
```astro
import TicketQuickCreate from '../../components/TicketQuickCreate.svelte';
```

Find the usage:
```astro
<BugReportWidget client:load defaultCategory="zahlung" />
```
Replace with:
```astro
<div class="fixed bottom-6 right-6 z-40">
  <TicketQuickCreate client:load context="portal" defaultCategory="zahlung" />
</div>
```

- [ ] **Step 4: Commit all layout changes**

```bash
git add website/src/layouts/AdminLayout.astro \
        website/src/layouts/PortalLayout.astro \
        website/src/pages/stripe/success.astro
git commit -m "feat(tickets): wire TicketWidgetBar into all layouts"
```

---

## Task 6: Smoke Verification

- [ ] **Step 1: TypeScript check**

```bash
cd /home/patrick/Bachelorprojekt
npx tsc --noEmit -p website/tsconfig.json 2>&1 | head -40
# Expected: no errors (or only pre-existing unrelated errors)
```

- [ ] **Step 2: Kustomize validate (no Kubernetes changes — skip)**

No manifests changed in this feature.

- [ ] **Step 3: Run offline tests**

```bash
task test:all 2>&1 | tail -20
# Expected: all tests pass (BATS unit + kustomize manifest + Taskfile dry-run)
```

- [ ] **Step 4: Dev server smoke test**

```bash
task website:dev &
sleep 6
# Check Astro starts without errors
curl -s -o /dev/null -w '%{http_code}' http://localhost:4321/
# Expected: 200 or 302
kill %1
```

- [ ] **Step 5: Final commit if any fixups**

```bash
git status
# If any leftover changes:
git add -p
git commit -m "fix(tickets): address smoke-test fixups"
```

- [ ] **Step 6: Push branch**

```bash
git push -u origin worktree-feature+ticket-quick-tools
```
