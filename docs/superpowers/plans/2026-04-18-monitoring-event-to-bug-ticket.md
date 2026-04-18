# Monitoring Event → Bug Ticket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bug-icon button to each Recent Events row in the monitoring dashboard that opens a pre-filled modal for creating a bug ticket via a new admin-only API endpoint.

**Architecture:** A new `POST /api/admin/bugs/create` endpoint accepts JSON `{description, category}`, fills server-side fields from the admin session, and calls the existing `insertBugTicket` DB function. `MonitoringDashboard.svelte` gains per-row buttons and an overlay modal with pre-filled description from the event data.

**Tech Stack:** Astro API routes (TypeScript), Svelte 4, Tailwind CSS, PostgreSQL via existing `insertBugTicket` helper in `website-db.ts`.

---

## File Map

| Action | Path |
|---|---|
| Create | `website/src/pages/api/admin/bugs/create.ts` |
| Modify | `website/src/components/admin/MonitoringDashboard.svelte` |

---

### Task 1: New API endpoint `/api/admin/bugs/create`

**Files:**
- Create: `website/src/pages/api/admin/bugs/create.ts`

- [ ] **Step 1: Create the endpoint file**

```typescript
// website/src/pages/api/admin/bugs/create.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { insertBugTicket } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';
const VALID_CATEGORIES = new Set(['fehler', 'verbesserung', 'erweiterungswunsch']);

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function generateTicketId(): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `BR-${today}-${rand}`;
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return jsonError('Nicht autorisiert', 401);
  }

  let body: { description?: unknown; category?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError('Ungültiger JSON-Body', 400);
  }

  const description = (typeof body.description === 'string' ? body.description : '').trim();
  const category = (typeof body.category === 'string' ? body.category : '').trim();

  if (!description) {
    return jsonError('Beschreibung ist erforderlich', 400);
  }
  if (description.length > 2000) {
    return jsonError('Beschreibung zu lang (max. 2000 Zeichen)', 400);
  }
  if (!VALID_CATEGORIES.has(category)) {
    return jsonError('Ungültige Kategorie', 400);
  }

  const ticketId = generateTicketId();

  try {
    await insertBugTicket({
      ticketId,
      category,
      reporterEmail: session.email,
      description,
      url: '/admin/monitoring',
      brand: BRAND,
    });
  } catch (err) {
    console.error('[bugs/create] DB error:', err);
    return jsonError('Datenbankfehler', 500);
  }

  return new Response(JSON.stringify({ ticketId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/bugs/create.ts
git commit -m "feat(admin): add /api/admin/bugs/create endpoint for monitoring-sourced tickets"
```

---

### Task 2: Bug button + modal in MonitoringDashboard.svelte

**Files:**
- Modify: `website/src/components/admin/MonitoringDashboard.svelte`

- [ ] **Step 1: Add modal state variables to the `<script>` block**

In `MonitoringDashboard.svelte`, after the existing `let` declarations (after line 32), add:

```typescript
  let selectedEvent: Event | null = null;
  let modalDescription = '';
  let modalCategory = 'fehler';
  let modalLoading = false;
  let modalError: string | null = null;
  let modalSuccessId: string | null = null;
  let modalCloseTimer: ReturnType<typeof setTimeout> | null = null;

  function openModal(event: Event) {
    selectedEvent = event;
    modalDescription = `${event.reason} on ${event.object}: ${event.message}`;
    modalCategory = 'fehler';
    modalLoading = false;
    modalError = null;
    modalSuccessId = null;
  }

  function closeModal() {
    if (modalCloseTimer) clearTimeout(modalCloseTimer);
    selectedEvent = null;
    modalSuccessId = null;
    modalError = null;
  }

  async function submitTicket() {
    if (!selectedEvent) return;
    modalLoading = true;
    modalError = null;
    try {
      const res = await fetch('/api/admin/bugs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: modalDescription, category: modalCategory }),
      });
      const data = await res.json();
      if (!res.ok) {
        modalError = data.error ?? 'Unbekannter Fehler';
        return;
      }
      modalSuccessId = data.ticketId;
      modalCloseTimer = setTimeout(closeModal, 3000);
    } catch {
      modalError = 'Netzwerkfehler';
    } finally {
      modalLoading = false;
    }
  }
```

- [ ] **Step 2: Add the bug-icon button to each event row**

In the `{#each data.events as event}` block, the current row ends with:

```html
              <div class="flex-shrink-0 text-xs text-gray-500">
                {event.age}
              </div>
```

Replace that `</div>` section with:

```html
              <div class="flex-shrink-0 flex items-center gap-2 text-xs text-gray-500">
                <span>{event.age}</span>
                <button
                  on:click={() => openModal(event)}
                  title="Bug Ticket erstellen"
                  class="text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Bug Ticket erstellen"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
```

- [ ] **Step 3: Add the modal markup**

At the very end of the component (after the closing `</div>` of the whole `<div class="space-y-6">` block, before the end of file), add:

```html
{#if selectedEvent}
  <!-- Modal backdrop -->
  <div
    class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
    on:click|self={closeModal}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <div class="bg-dark-light border border-dark-lighter rounded-lg shadow-xl w-full max-w-lg">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-dark-lighter flex items-center justify-between">
        <h2 id="modal-title" class="text-lg font-semibold text-light">Bug Ticket erstellen</h2>
        <button on:click={closeModal} class="text-gray-400 hover:text-light transition-colors" aria-label="Schließen">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="px-6 py-4 space-y-4">
        <!-- Event summary -->
        <p class="text-xs text-muted font-mono bg-dark rounded px-3 py-2">
          {selectedEvent.type} · {selectedEvent.reason} · {selectedEvent.object}
        </p>

        {#if modalSuccessId}
          <div class="text-sm text-green-500 space-y-1">
            <p>Ticket erstellt: <strong>{modalSuccessId}</strong></p>
            <a href="/admin/bugs" class="underline hover:text-green-400">Zur Ticket-Übersicht →</a>
            <p class="text-xs text-muted">Schließt in 3 Sekunden…</p>
          </div>
        {:else}
          <!-- Description -->
          <div>
            <label for="modal-desc" class="block text-sm font-medium text-light mb-1">Beschreibung</label>
            <textarea
              id="modal-desc"
              bind:value={modalDescription}
              rows={4}
              maxlength={2000}
              class="w-full rounded-md border border-dark-lighter bg-dark text-light text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            ></textarea>
          </div>

          <!-- Category -->
          <div>
            <label for="modal-cat" class="block text-sm font-medium text-light mb-1">Kategorie</label>
            <select
              id="modal-cat"
              bind:value={modalCategory}
              class="w-full rounded-md border border-dark-lighter bg-dark text-light text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="fehler">Fehler</option>
              <option value="verbesserung">Verbesserung</option>
              <option value="erweiterungswunsch">Erweiterungswunsch</option>
            </select>
          </div>

          {#if modalError}
            <p class="text-sm text-red-500">{modalError}</p>
          {/if}
        {/if}
      </div>

      <!-- Footer -->
      {#if !modalSuccessId}
        <div class="px-6 py-4 border-t border-dark-lighter flex justify-end gap-3">
          <button
            on:click={closeModal}
            class="px-4 py-2 text-sm rounded-md border border-dark-lighter text-light hover:bg-dark transition-colors"
          >
            Abbrechen
          </button>
          <button
            on:click={submitTicket}
            disabled={modalLoading || !modalDescription.trim()}
            class="px-4 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            {modalLoading ? 'Erstelle…' : 'Erstellen'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 5: Start dev server and manually test**

```bash
cd /home/patrick/Bachelorprojekt && task website:dev
```

Navigate to `http://web.localhost/admin/monitoring` (or the local dev URL). Verify:

1. Each event row shows a small icon button on the right.
2. Clicking it opens the modal with the summary line and pre-filled description.
3. Description is editable; category dropdown works.
4. "Abbrechen" closes the modal.
5. "Erstellen" submits, shows success with ticket ID and link.
6. Modal auto-closes after ~3 seconds.
7. Navigate to `/admin/bugs` — the new ticket appears.
8. Verify clicking outside the modal (backdrop) also closes it.

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/MonitoringDashboard.svelte
git commit -m "feat(admin): add 'create bug ticket' button and modal to monitoring Recent Events"
```

---

### Task 3: Deploy

- [ ] **Step 1: Deploy to live**

```bash
cd /home/patrick/Bachelorprojekt && task website:deploy
```

- [ ] **Step 2: Smoke-test on live**

Navigate to the live monitoring page, open the modal on any event, create a ticket, confirm it appears in `/admin/bugs`.

- [ ] **Step 3: Commit docs**

```bash
git add docs/superpowers/specs/2026-04-18-monitoring-event-to-bug-ticket-design.md \
        docs/superpowers/plans/2026-04-18-monitoring-event-to-bug-ticket.md
git commit -m "docs: add monitoring event → bug ticket spec and plan"
```
