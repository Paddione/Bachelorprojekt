# Admin Bug Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-rendered admin page at `/admin/bugs` that lists all bug tickets with filter/sort, and lets admins resolve (with note) or archive tickets inline.

**Architecture:** Astro SSR page with URL-param-driven filters, plain HTML form POSTs for actions, and a native `<dialog>` for the resolve note. No client framework — only a small vanilla JS script to wire up the dialog. Two new API endpoints handle resolve and archive. One new DB query function lists tickets.

**Tech Stack:** Astro SSR (Node adapter), TypeScript, PostgreSQL via `pg` pool, Tailwind CSS (existing custom classes: `bg-dark`, `bg-dark-light`, `border-dark-lighter`, `text-light`, `text-muted`, `text-gold`, `font-serif`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `website/src/lib/meetings-db.ts` | Modify | Add `BugTicketRow`, `initBugTicketsTable()`, `listBugTickets(filters)` |
| `website/src/pages/api/admin/bugs/resolve.ts` | Create | POST — resolve ticket with note, redirect back |
| `website/src/pages/api/admin/bugs/archive.ts` | Create | POST — archive ticket, redirect back |
| `website/src/pages/admin/bugs.astro` | Create | Server-rendered list page with filters + action forms + dialog |
| `website/src/pages/admin.astro` | Modify | Add "Bug Reports" nav link with open-ticket badge |

---

## Task 1: Add `listBugTickets` and `initBugTicketsTable` to the DB module

**Files:**
- Modify: `website/src/lib/meetings-db.ts`

- [ ] **Step 1: Add `BugTicketRow` interface and `initBugTicketsTable` at the bottom of the file**

Open `website/src/lib/meetings-db.ts` and append after the last export:

```ts
// ── Bug Tickets Table Init ────────────────────────────────────────────────────

export async function initBugTicketsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bug_tickets (
      ticket_id       TEXT PRIMARY KEY,
      category        TEXT NOT NULL,
      reporter_email  TEXT NOT NULL,
      description     TEXT NOT NULL,
      url             TEXT,
      brand           TEXT NOT NULL DEFAULT 'mentolder',
      status          TEXT NOT NULL DEFAULT 'open',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at     TIMESTAMPTZ,
      resolution_note TEXT
    )
  `);
}

// ── Bug Ticket List ───────────────────────────────────────────────────────────

export interface BugTicketRow {
  ticketId: string;
  category: string;
  reporterEmail: string;
  description: string;
  url: string | null;
  brand: string;
  status: 'open' | 'resolved' | 'archived';
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

export async function listBugTickets(filters: {
  status?: string;
  category?: string;
  brand?: string;
  q?: string;
  limit?: number;
}): Promise<BugTicketRow[]> {
  await initBugTicketsTable();
  const { status, category, brand, q, limit = 200 } = filters;
  const result = await pool.query(
    `SELECT ticket_id        AS "ticketId",
            category,
            reporter_email   AS "reporterEmail",
            description,
            url,
            brand,
            status,
            created_at       AS "createdAt",
            resolved_at      AS "resolvedAt",
            resolution_note  AS "resolutionNote"
     FROM bug_tickets
     WHERE ($1::text IS NULL OR brand = $1)
       AND ($2::text IS NULL OR status = $2)
       AND ($3::text IS NULL OR category = $3)
       AND ($4::text IS NULL OR ticket_id ILIKE '%' || $4 || '%'
                              OR reporter_email ILIKE '%' || $4 || '%')
     ORDER BY created_at DESC
     LIMIT $5`,
    [brand ?? null, status ?? null, category ?? null, q ?? null, limit]
  );
  return result.rows;
}
```

- [ ] **Step 2: Type-check**

```bash
cd website && npx tsc --noEmit
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/meetings-db.ts
git commit -m "feat(admin): add listBugTickets and initBugTicketsTable to DB module"
```

---

## Task 2: Add `POST /api/admin/bugs/resolve` endpoint

**Files:**
- Create: `website/src/pages/api/admin/bugs/resolve.ts`

- [ ] **Step 1: Create the file**

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { resolveBugTicket } from '../../../../lib/meetings-db';

function buildBackUrl(filters: { status: string; category: string; q: string }): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.category) params.set('category', filters.category);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return `/admin/bugs${qs ? '?' + qs : ''}`;
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(null, { status: 403 });
  }

  const form = await request.formData();
  const ticketId = form.get('ticketId')?.toString().trim() ?? '';
  const resolutionNote = form.get('resolutionNote')?.toString().trim() ?? '';
  const status = form.get('status')?.toString() ?? '';
  const category = form.get('category')?.toString() ?? '';
  const q = form.get('q')?.toString() ?? '';

  const backUrl = buildBackUrl({ status, category, q });

  if (!ticketId || !resolutionNote) {
    return Response.redirect(
      new URL(`${backUrl}${backUrl.includes('?') ? '&' : '?'}error=Ticket-ID+und+L%C3%B6sungshinweis+sind+erforderlich`, request.url),
      303,
    );
  }
  if (resolutionNote.length > 1000) {
    return Response.redirect(
      new URL(`${backUrl}${backUrl.includes('?') ? '&' : '?'}error=L%C3%B6sungshinweis+zu+lang+(max.+1000+Zeichen)`, request.url),
      303,
    );
  }

  try {
    await resolveBugTicket(ticketId, resolutionNote);
  } catch (err) {
    console.error('[bugs/resolve] DB error:', err);
    return Response.redirect(
      new URL(`${backUrl}${backUrl.includes('?') ? '&' : '?'}error=Datenbankfehler`, request.url),
      303,
    );
  }

  return Response.redirect(new URL(backUrl, request.url), 303);
};
```

- [ ] **Step 2: Type-check**

```bash
cd website && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/bugs/resolve.ts
git commit -m "feat(admin): add POST /api/admin/bugs/resolve endpoint"
```

---

## Task 3: Add `POST /api/admin/bugs/archive` endpoint

**Files:**
- Create: `website/src/pages/api/admin/bugs/archive.ts`

- [ ] **Step 1: Create the file**

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { archiveBugTicket } from '../../../../lib/meetings-db';

function buildBackUrl(filters: { status: string; category: string; q: string }): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.category) params.set('category', filters.category);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return `/admin/bugs${qs ? '?' + qs : ''}`;
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(null, { status: 403 });
  }

  const form = await request.formData();
  const ticketId = form.get('ticketId')?.toString().trim() ?? '';
  const status = form.get('status')?.toString() ?? '';
  const category = form.get('category')?.toString() ?? '';
  const q = form.get('q')?.toString() ?? '';

  const backUrl = buildBackUrl({ status, category, q });

  if (!ticketId) {
    return Response.redirect(
      new URL(`${backUrl}${backUrl.includes('?') ? '&' : '?'}error=Ticket-ID+fehlt`, request.url),
      303,
    );
  }

  try {
    await archiveBugTicket(ticketId);
  } catch (err) {
    console.error('[bugs/archive] DB error:', err);
    return Response.redirect(
      new URL(`${backUrl}${backUrl.includes('?') ? '&' : '?'}error=Datenbankfehler`, request.url),
      303,
    );
  }

  return Response.redirect(new URL(backUrl, request.url), 303);
};
```

- [ ] **Step 2: Type-check**

```bash
cd website && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/bugs/archive.ts
git commit -m "feat(admin): add POST /api/admin/bugs/archive endpoint"
```

---

## Task 4: Create `/admin/bugs.astro` page

**Files:**
- Create: `website/src/pages/admin/bugs.astro`

- [ ] **Step 1: Create the file**

```astro
---
import Layout from '../../layouts/Layout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import { listBugTickets } from '../../lib/meetings-db';
import type { BugTicketRow } from '../../lib/meetings-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const statusFilter   = Astro.url.searchParams.get('status')   ?? '';
const categoryFilter = Astro.url.searchParams.get('category') ?? '';
const qFilter        = Astro.url.searchParams.get('q')        ?? '';
const errorMsg       = Astro.url.searchParams.get('error')    ?? '';

const BRAND = process.env.BRAND || 'mentolder';

let tickets: BugTicketRow[] = [];
let dbError = '';
try {
  tickets = await listBugTickets({
    status:   statusFilter   || undefined,
    category: categoryFilter || undefined,
    brand:    BRAND,
    q:        qFilter        || undefined,
  });
} catch (err) {
  console.error('[admin/bugs] listBugTickets failed:', err);
  dbError = 'Datenbankfehler beim Laden der Tickets.';
}

const openCount = tickets.filter(t => t.status === 'open').length;

const CATEGORY_LABELS: Record<string, string> = {
  fehler:              '🔴 Fehler',
  verbesserung:        '💡 Verbesserung',
  erweiterungswunsch:  '✨ Erweiterungswunsch',
};

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function filterLink(overrides: Partial<{ status: string; category: string; q: string }>): string {
  const p = new URLSearchParams();
  const s = overrides.status   !== undefined ? overrides.status   : statusFilter;
  const c = overrides.category !== undefined ? overrides.category : categoryFilter;
  const q = overrides.q        !== undefined ? overrides.q        : qFilter;
  if (s) p.set('status', s);
  if (c) p.set('category', c);
  if (q) p.set('q', q);
  const qs = p.toString();
  return `/admin/bugs${qs ? '?' + qs : ''}`;
}
---

<Layout title="Admin — Bug Reports">
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-6xl mx-auto px-6">

      <div class="mb-2">
        <a href="/admin" class="text-muted hover:text-gold text-sm">← Zurück zur Übersicht</a>
      </div>

      <div class="mb-8 flex items-center gap-4">
        <div>
          <h1 class="text-3xl font-bold text-light font-serif">Bug Reports</h1>
          <p class="text-muted mt-1">{openCount} offen</p>
        </div>
      </div>

      {/* Error banner */}
      {(errorMsg || dbError) && (
        <div id="error-banner"
          class="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm flex items-start justify-between gap-4">
          <span>{decodeURIComponent((errorMsg || dbError).replace(/\+/g, ' '))}</span>
          <button type="button" onclick="document.getElementById('error-banner').remove()"
            class="text-red-400 hover:text-red-200 shrink-0 leading-none">✕</button>
        </div>
      )}

      {/* Filters */}
      <div class="flex flex-wrap gap-3 mb-6 items-center">
        {/* Status tab links */}
        <div class="flex gap-1 p-1 bg-dark-light rounded-lg border border-dark-lighter">
          {([
            { value: '', label: 'Alle' },
            { value: 'open', label: 'Offen' },
            { value: 'resolved', label: 'Erledigt' },
            { value: 'archived', label: 'Archiviert' },
          ] as const).map(opt => (
            <a
              href={filterLink({ status: opt.value })}
              class={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-gold text-dark'
                  : 'text-muted hover:text-light'
              }`}
            >
              {opt.label}
            </a>
          ))}
        </div>

        {/* Category filter — submits as GET form to preserve other params */}
        <form method="get" action="/admin/bugs" class="contents">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {qFilter && <input type="hidden" name="q" value={qFilter} />}
          <select name="category" onchange="this.form.submit()"
            class="px-3 py-1.5 bg-dark-light border border-dark-lighter text-sm text-light rounded-lg cursor-pointer">
            <option value="" selected={!categoryFilter}>Alle Kategorien</option>
            <option value="fehler"             selected={categoryFilter === 'fehler'}>Fehler</option>
            <option value="verbesserung"       selected={categoryFilter === 'verbesserung'}>Verbesserung</option>
            <option value="erweiterungswunsch" selected={categoryFilter === 'erweiterungswunsch'}>Erweiterungswunsch</option>
          </select>
        </form>

        {/* Search */}
        <form method="get" action="/admin/bugs" class="flex gap-2 ml-auto">
          {statusFilter   && <input type="hidden" name="status"   value={statusFilter} />}
          {categoryFilter && <input type="hidden" name="category" value={categoryFilter} />}
          <input
            type="text" name="q" value={qFilter}
            placeholder="Ticket-ID oder E-Mail"
            class="px-3 py-1.5 bg-dark-light border border-dark-lighter text-sm text-light rounded-lg w-56 focus:border-gold focus:ring-2 focus:ring-gold/20"
          />
          <button type="submit"
            class="px-3 py-1.5 bg-gold/20 text-gold rounded-lg text-sm hover:bg-gold/30 transition-colors">
            Suchen
          </button>
        </form>
      </div>

      {/* Table */}
      <div class="bg-dark-light rounded-2xl border border-dark-lighter overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-dark-lighter">
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Ticket-ID</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Kategorie</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Reporter</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">URL</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Datum</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Status</th>
              <th class="text-right px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colspan="7" class="px-4 py-10 text-center text-muted text-sm">
                  Keine Einträge für diese Filterauswahl.
                </td>
              </tr>
            ) : tickets.map(ticket => (
              <tr class={`border-b border-dark-lighter last:border-0 transition-opacity ${ticket.status === 'archived' ? 'opacity-40' : ''}`}>
                <td class="px-4 py-3 font-mono text-xs text-gold whitespace-nowrap">{ticket.ticketId}</td>
                <td class="px-4 py-3 text-sm text-light whitespace-nowrap">
                  {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                </td>
                <td class="px-4 py-3 text-sm text-muted">{ticket.reporterEmail}</td>
                <td class="px-4 py-3 text-xs text-muted max-w-[180px] truncate" title={ticket.url ?? ''}>
                  {ticket.url ? ticket.url.replace(/^https?:\/\//, '').slice(0, 35) + (ticket.url.length > 35 ? '…' : '') : '—'}
                </td>
                <td class="px-4 py-3 text-sm text-muted whitespace-nowrap">{formatDate(ticket.createdAt)}</td>
                <td class="px-4 py-3">
                  {ticket.status === 'open' && (
                    <span class="text-xs px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-300 border border-yellow-800 whitespace-nowrap">
                      🕐 Offen
                    </span>
                  )}
                  {ticket.status === 'resolved' && (
                    <div>
                      <span class="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-300 border border-green-800 whitespace-nowrap">
                        ✓ Erledigt
                      </span>
                      {ticket.resolutionNote && (
                        <p class="text-xs text-muted mt-1 max-w-[200px]">
                          {ticket.resolutionNote.slice(0, 80)}{ticket.resolutionNote.length > 80 ? '…' : ''}
                        </p>
                      )}
                    </div>
                  )}
                  {ticket.status === 'archived' && (
                    <span class="text-xs px-2 py-0.5 rounded-full bg-dark border border-dark-lighter text-muted whitespace-nowrap">
                      🗂 Archiviert
                    </span>
                  )}
                </td>
                <td class="px-4 py-3">
                  {ticket.status === 'open' && (
                    <div class="flex gap-2 justify-end">
                      <button
                        type="button"
                        class="resolve-btn px-3 py-1 text-xs bg-green-900/30 text-green-300 border border-green-800 rounded hover:bg-green-900/50 transition-colors"
                        data-ticket-id={ticket.ticketId}
                      >
                        Erledigt
                      </button>
                      <form method="post" action="/api/admin/bugs/archive">
                        <input type="hidden" name="ticketId"  value={ticket.ticketId} />
                        <input type="hidden" name="status"    value={statusFilter} />
                        <input type="hidden" name="category"  value={categoryFilter} />
                        <input type="hidden" name="q"         value={qFilter} />
                        <button type="submit"
                          class="px-3 py-1 text-xs bg-dark border border-dark-lighter text-muted rounded hover:text-light hover:border-gold/40 transition-colors">
                          Archivieren
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  </section>

  {/* Resolve dialog */}
  <dialog id="resolve-dialog"
    class="bg-dark-light border border-dark-lighter rounded-2xl p-6 w-full max-w-md backdrop:bg-black/60">
    <h2 class="text-lg font-semibold text-light mb-1 font-serif">Ticket erledigen</h2>
    <p id="resolve-dialog-ticket" class="text-xs text-gold font-mono mb-4"></p>
    <form method="post" action="/api/admin/bugs/resolve">
      <input type="hidden" name="ticketId"  id="resolve-ticket-id" />
      <input type="hidden" name="status"    value={statusFilter} />
      <input type="hidden" name="category"  value={categoryFilter} />
      <input type="hidden" name="q"         value={qFilter} />
      <label class="block text-sm text-muted mb-2">
        Lösungshinweis <span class="text-red-400">*</span>
      </label>
      <textarea
        name="resolutionNote"
        required
        maxlength="1000"
        rows="4"
        placeholder="Was wurde getan? Wie wurde das Problem behoben?"
        class="w-full px-3 py-2 bg-dark border border-dark-lighter text-light text-sm rounded-lg resize-none focus:border-gold focus:ring-2 focus:ring-gold/20"
      ></textarea>
      <p class="text-xs text-muted mt-1 mb-4">Max. 1000 Zeichen</p>
      <div class="flex gap-3 justify-end">
        <button type="button" id="resolve-cancel"
          class="px-4 py-2 text-sm text-muted hover:text-light transition-colors">
          Abbrechen
        </button>
        <button type="submit"
          class="px-4 py-2 text-sm bg-gold hover:bg-gold-light text-dark font-semibold rounded-lg transition-colors">
          Speichern
        </button>
      </div>
    </form>
  </dialog>
</Layout>

<script>
  const dialog = document.getElementById('resolve-dialog') as HTMLDialogElement;
  const ticketIdInput = document.getElementById('resolve-ticket-id') as HTMLInputElement;
  const ticketLabel = document.getElementById('resolve-dialog-ticket') as HTMLParagraphElement;

  document.querySelectorAll<HTMLButtonElement>('.resolve-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.ticketId ?? '';
      ticketIdInput.value = id;
      ticketLabel.textContent = id;
      dialog.showModal();
    });
  });

  document.getElementById('resolve-cancel')?.addEventListener('click', () => {
    dialog.close();
  });
</script>
```

- [ ] **Step 2: Type-check**

```bash
cd website && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/admin/bugs.astro
git commit -m "feat(admin): add server-rendered bug tracker page at /admin/bugs"
```

---

## Task 5: Add "Bug Reports" nav link to `/admin.astro`

**Files:**
- Modify: `website/src/pages/admin.astro`

- [ ] **Step 1: Add `listBugTickets` import and open-ticket count to the frontmatter**

Replace the frontmatter block (lines 1–20) with:

```astro
---
import Layout from '../layouts/Layout.astro';
import { getSession, getLoginUrl, isAdmin } from '../lib/auth';
import { listUsers } from '../lib/keycloak';
import { listBugTickets } from '../lib/meetings-db';
import type { KcUser } from '../lib/keycloak';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) {
  return Astro.redirect(getLoginUrl());
}
if (!isAdmin(session)) {
  return Astro.redirect('/portal');
}

let users: KcUser[] = [];
try {
  users = await listUsers();
} catch {
  // Keycloak unavailable
}

let openBugCount = 0;
try {
  const openTickets = await listBugTickets({
    status: 'open',
    brand: process.env.BRAND || 'mentolder',
    limit: 1000,
  });
  openBugCount = openTickets.length;
} catch {
  // DB unavailable — badge just shows 0
}
---
```

- [ ] **Step 2: Replace the single nav link with a row of two links**

Replace:
```astro
        <a
          href="/admin/mattermost"
          class="px-4 py-2 bg-gold/20 text-gold rounded-lg text-sm font-medium hover:bg-gold/30 transition-colors"
        >
          Mattermost verwalten
        </a>
```

With:
```astro
        <div class="flex gap-3">
          <a
            href="/admin/bugs"
            class="relative px-4 py-2 bg-gold/20 text-gold rounded-lg text-sm font-medium hover:bg-gold/30 transition-colors"
          >
            Bug Reports
            {openBugCount > 0 && (
              <span class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {openBugCount > 99 ? '99+' : openBugCount}
              </span>
            )}
          </a>
          <a
            href="/admin/mattermost"
            class="px-4 py-2 bg-gold/20 text-gold rounded-lg text-sm font-medium hover:bg-gold/30 transition-colors"
          >
            Mattermost
          </a>
        </div>
```

- [ ] **Step 3: Type-check**

```bash
cd website && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/admin.astro
git commit -m "feat(admin): add Bug Reports nav link with open-ticket badge"
```

---

## Task 6: Deploy and verify

- [ ] **Step 1: Build the website image and deploy to mentolder**

```bash
task website:deploy
```

Wait for the pod to become Ready (watch `task workspace:status` or `kubectl get pods -n website -w`).

- [ ] **Step 2: Log in as admin and open the bug tracker**

Navigate to `https://web.mentolder.de/admin/bugs`.

Expected: table renders (empty if no tickets yet), filter tabs work, no JS errors in console.

- [ ] **Step 3: Submit a test bug report to create a ticket**

Open the bug widget on `https://web.mentolder.de`, fill in the form, submit.

Expected: `200 OK` response with a `ticketId` like `BR-20260415-xxxx`.

- [ ] **Step 4: Verify the ticket appears in the admin view**

Reload `https://web.mentolder.de/admin/bugs`.

Expected: the new ticket appears with status "🕐 Offen".

- [ ] **Step 5: Resolve the ticket**

Click "Erledigt", enter a resolution note, click "Speichern".

Expected: page reloads, ticket now shows "✓ Erledigt" badge and the note is truncated inline.

- [ ] **Step 6: Archive a ticket**

Submit another bug report, then click "Archivieren" next to it.

Expected: page reloads, ticket shows "🗂 Archiviert" and is visually dimmed. No action buttons.

- [ ] **Step 7: Verify filter tabs**

Click "Offen" tab → only open tickets shown. Click "Erledigt" → only resolved. Click "Alle" → all.

- [ ] **Step 8: Verify search**

Type part of the ticket ID or reporter email in the search box, click "Suchen".

Expected: table filters to matching rows only.

- [ ] **Step 9: Verify the admin overview badge**

Navigate to `https://web.mentolder.de/admin`.

Expected: "Bug Reports" button has a red badge showing the number of open tickets.
