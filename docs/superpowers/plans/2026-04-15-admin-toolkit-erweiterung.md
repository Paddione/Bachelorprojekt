# Admin Toolkit Erweiterung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sieben neue Admin-Features implementieren: Zeiterfassung, Rechnungsübersicht, Kunden-Notizen, Dashboard-KPIs, Onboarding-Checkliste, Follow-up-System und Aufgaben-Kalender.

**Architecture:** Alle Features bauen auf dem bestehenden Muster auf: Astro-Seiten mit server-seitigem Rendering, direktes PostgreSQL via `pg`-Pool in `website-db.ts`, Auth-Check per `getSession`/`isAdmin`, Tailwind Dark-Theme. Neue DB-Tabellen werden per `CREATE TABLE IF NOT EXISTS` beim ersten API-Aufruf angelegt. Mattermost-Benachrichtigungen laufen über `postWebhook` / `postToChannel` aus `mattermost.ts`.

**Tech Stack:** Astro 4, Svelte (nur für bestehende Komponenten), TypeScript, PostgreSQL 16 (`pg`), Tailwind CSS, Invoice Ninja v5 REST API, Mattermost Webhooks.

---

## Datei-Übersicht

### Neue Dateien

| Datei | Zweck |
|-------|-------|
| `website/src/pages/admin/zeiterfassung.astro` | Zeiterfassungs-Übersicht |
| `website/src/pages/admin/rechnungen.astro` | Rechnungsübersicht (alle Clients) |
| `website/src/pages/admin/followups.astro` | Follow-up Verwaltung |
| `website/src/pages/admin/kalender.astro` | Aufgaben-Kalender (Monatsansicht) |
| `website/src/pages/api/admin/zeiterfassung/create.ts` | Zeiteintrag erstellen |
| `website/src/pages/api/admin/zeiterfassung/update.ts` | Zeiteintrag aktualisieren |
| `website/src/pages/api/admin/zeiterfassung/delete.ts` | Zeiteintrag löschen |
| `website/src/pages/api/admin/zeiterfassung/export.ts` | CSV-Export für Invoice Ninja |
| `website/src/pages/api/admin/clientnotes/create.ts` | Kunden-Notiz anlegen |
| `website/src/pages/api/admin/clientnotes/delete.ts` | Kunden-Notiz löschen |
| `website/src/pages/api/admin/onboarding/update.ts` | Onboarding-Item abhaken |
| `website/src/pages/api/admin/onboarding/reset.ts` | Onboarding zurücksetzen |
| `website/src/pages/api/admin/followups/create.ts` | Follow-up erstellen |
| `website/src/pages/api/admin/followups/update.ts` | Follow-up Status/Datum ändern |
| `website/src/pages/api/admin/followups/delete.ts` | Follow-up löschen |
| `website/src/pages/api/admin/followups/notify.ts` | Mattermost-Benachrichtigung auslösen |
| `website/src/components/portal/ClientNotesTab.astro` | Notizen-Tab im Client-Profil |
| `website/src/components/portal/OnboardingTab.astro` | Onboarding-Tab im Client-Profil |

### Modifizierte Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/lib/website-db.ts` | Neue Tabellen + Funktionen: time_entries, client_notes, onboarding_items, follow_ups |
| `website/src/lib/invoiceninja.ts` | Neue Funktion `getAllInvoices()` |
| `website/src/pages/admin.astro` | KPI-Kacheln + neue Tool-Tiles |
| `website/src/pages/admin/[clientId].astro` | Tabs: Notizen + Onboarding hinzufügen |

---

## Task 1: DB-Schicht — Alle neuen Tabellen

**Files:**
- Modify: `website/src/lib/website-db.ts`

### Zeiterfassung

- [ ] **Schritt 1.1: Typen und `initTimeEntriesTable` ergänzen**

Am Ende von `website/src/lib/website-db.ts` anfügen:

```typescript
// ── Time Entries ─────────────────────────────────────────────────────────────

export interface TimeEntry {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskName: string | null;
  description: string | null;
  minutes: number;
  billable: boolean;
  entryDate: Date;
  createdAt: Date;
}

export async function initTimeEntriesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task_id     UUID REFERENCES project_tasks(id) ON DELETE SET NULL,
      description TEXT,
      minutes     INTEGER NOT NULL CHECK (minutes > 0),
      billable    BOOLEAN NOT NULL DEFAULT true,
      entry_date  DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS time_entries_project_idx ON time_entries(project_id)`);
}

export async function createTimeEntry(params: {
  projectId: string;
  taskId?: string;
  description?: string;
  minutes: number;
  billable?: boolean;
  entryDate?: string;
}): Promise<TimeEntry> {
  await initTimeEntriesTable();
  const res = await pool.query(
    `INSERT INTO time_entries (project_id, task_id, description, minutes, billable, entry_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, project_id AS "projectId", task_id AS "taskId",
               description, minutes, billable, entry_date AS "entryDate", created_at AS "createdAt"`,
    [params.projectId, params.taskId || null, params.description || null,
     params.minutes, params.billable ?? true, params.entryDate || new Date().toISOString().slice(0, 10)]
  );
  return res.rows[0];
}

export async function listTimeEntries(projectId: string): Promise<TimeEntry[]> {
  await initTimeEntriesTable();
  const res = await pool.query(
    `SELECT te.id, te.project_id AS "projectId", p.name AS "projectName",
            te.task_id AS "taskId", pt.name AS "taskName",
            te.description, te.minutes, te.billable,
            te.entry_date AS "entryDate", te.created_at AS "createdAt"
     FROM time_entries te
     JOIN projects p ON p.id = te.project_id
     LEFT JOIN project_tasks pt ON pt.id = te.task_id
     WHERE te.project_id = $1
     ORDER BY te.entry_date DESC, te.created_at DESC`,
    [projectId]
  );
  return res.rows;
}

export async function listAllTimeEntries(params?: {
  billable?: boolean;
  since?: string;
}): Promise<TimeEntry[]> {
  await initTimeEntriesTable();
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (params?.billable !== undefined) {
    conditions.push(`te.billable = $${idx}`); values.push(params.billable); idx++;
  }
  if (params?.since) {
    conditions.push(`te.entry_date >= $${idx}`); values.push(params.since); idx++;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await pool.query(
    `SELECT te.id, te.project_id AS "projectId", p.name AS "projectName",
            te.task_id AS "taskId", pt.name AS "taskName",
            te.description, te.minutes, te.billable,
            te.entry_date AS "entryDate", te.created_at AS "createdAt"
     FROM time_entries te
     JOIN projects p ON p.id = te.project_id
     LEFT JOIN project_tasks pt ON pt.id = te.task_id
     ${where}
     ORDER BY te.entry_date DESC, te.created_at DESC`,
    values
  );
  return res.rows;
}

export async function deleteTimeEntry(id: string): Promise<void> {
  await pool.query('DELETE FROM time_entries WHERE id = $1', [id]);
}

export async function getProjectTotalMinutes(projectId: string): Promise<{ total: number; billable: number }> {
  await initTimeEntriesTable();
  const res = await pool.query(
    `SELECT
       COALESCE(SUM(minutes), 0)::int AS total,
       COALESCE(SUM(CASE WHEN billable THEN minutes ELSE 0 END), 0)::int AS billable
     FROM time_entries WHERE project_id = $1`,
    [projectId]
  );
  return res.rows[0];
}
```

### Kunden-Notizen

- [ ] **Schritt 1.2: `client_notes`-Tabelle und Funktionen**

```typescript
// ── Client Notes ──────────────────────────────────────────────────────────────

export interface ClientNote {
  id: string;
  keycloakUserId: string;
  content: string;
  createdAt: Date;
}

async function initClientNotesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_notes (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id  TEXT NOT NULL,
      content           TEXT NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS client_notes_user_idx ON client_notes(keycloak_user_id)`);
}

export async function listClientNotes(keycloakUserId: string): Promise<ClientNote[]> {
  await initClientNotesTable();
  const res = await pool.query(
    `SELECT id, keycloak_user_id AS "keycloakUserId", content, created_at AS "createdAt"
     FROM client_notes WHERE keycloak_user_id = $1 ORDER BY created_at DESC`,
    [keycloakUserId]
  );
  return res.rows;
}

export async function createClientNote(keycloakUserId: string, content: string): Promise<ClientNote> {
  await initClientNotesTable();
  const res = await pool.query(
    `INSERT INTO client_notes (keycloak_user_id, content)
     VALUES ($1, $2) RETURNING id, keycloak_user_id AS "keycloakUserId", content, created_at AS "createdAt"`,
    [keycloakUserId, content.trim()]
  );
  return res.rows[0];
}

export async function deleteClientNote(id: string): Promise<void> {
  await pool.query('DELETE FROM client_notes WHERE id = $1', [id]);
}
```

### Onboarding-Checkliste

- [ ] **Schritt 1.3: `onboarding_items`-Tabelle und Funktionen**

```typescript
// ── Onboarding ────────────────────────────────────────────────────────────────

export interface OnboardingItem {
  id: string;
  keycloakUserId: string;
  label: string;
  done: boolean;
  sortOrder: number;
}

const DEFAULT_ONBOARDING_ITEMS = [
  'Erstgespräch gebucht',
  'Vertrag unterzeichnet',
  'Nextcloud-Ordner erstellt',
  'Mattermost-Kanal eingerichtet',
  'Rechnungsadresse erfasst',
  'Zugangsdaten versendet',
];

async function initOnboardingTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS onboarding_items (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id  TEXT NOT NULL,
      label             TEXT NOT NULL,
      done              BOOLEAN NOT NULL DEFAULT false,
      sort_order        INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS onboarding_user_idx ON onboarding_items(keycloak_user_id)`);
}

export async function getOrCreateOnboardingChecklist(keycloakUserId: string): Promise<OnboardingItem[]> {
  await initOnboardingTable();
  const existing = await pool.query(
    `SELECT id, keycloak_user_id AS "keycloakUserId", label, done, sort_order AS "sortOrder"
     FROM onboarding_items WHERE keycloak_user_id = $1 ORDER BY sort_order`,
    [keycloakUserId]
  );
  if (existing.rows.length > 0) return existing.rows;

  // Seed default items for new client
  for (let i = 0; i < DEFAULT_ONBOARDING_ITEMS.length; i++) {
    await pool.query(
      `INSERT INTO onboarding_items (keycloak_user_id, label, sort_order) VALUES ($1, $2, $3)`,
      [keycloakUserId, DEFAULT_ONBOARDING_ITEMS[i], i]
    );
  }
  const seeded = await pool.query(
    `SELECT id, keycloak_user_id AS "keycloakUserId", label, done, sort_order AS "sortOrder"
     FROM onboarding_items WHERE keycloak_user_id = $1 ORDER BY sort_order`,
    [keycloakUserId]
  );
  return seeded.rows;
}

export async function toggleOnboardingItem(id: string, done: boolean): Promise<void> {
  await pool.query('UPDATE onboarding_items SET done = $2 WHERE id = $1', [id, done]);
}

export async function resetOnboardingChecklist(keycloakUserId: string): Promise<void> {
  await pool.query('UPDATE onboarding_items SET done = false WHERE keycloak_user_id = $1', [keycloakUserId]);
}
```

### Follow-up-System

- [ ] **Schritt 1.4: `follow_ups`-Tabelle und Funktionen**

```typescript
// ── Follow-ups ────────────────────────────────────────────────────────────────

export interface FollowUp {
  id: string;
  keycloakUserId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  reason: string;
  dueDate: Date;
  done: boolean;
  createdAt: Date;
}

async function initFollowUpsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id  TEXT,
      client_name       TEXT,
      client_email      TEXT,
      reason            TEXT NOT NULL,
      due_date          DATE NOT NULL,
      done              BOOLEAN NOT NULL DEFAULT false,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function createFollowUp(params: {
  keycloakUserId?: string;
  clientName?: string;
  clientEmail?: string;
  reason: string;
  dueDate: string;
}): Promise<FollowUp> {
  await initFollowUpsTable();
  const res = await pool.query(
    `INSERT INTO follow_ups (keycloak_user_id, client_name, client_email, reason, due_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, keycloak_user_id AS "keycloakUserId", client_name AS "clientName",
               client_email AS "clientEmail", reason, due_date AS "dueDate", done, created_at AS "createdAt"`,
    [params.keycloakUserId || null, params.clientName || null, params.clientEmail || null,
     params.reason, params.dueDate]
  );
  return res.rows[0];
}

export async function listFollowUps(showDone = false): Promise<FollowUp[]> {
  await initFollowUpsTable();
  const res = await pool.query(
    `SELECT id, keycloak_user_id AS "keycloakUserId", client_name AS "clientName",
            client_email AS "clientEmail", reason, due_date AS "dueDate", done, created_at AS "createdAt"
     FROM follow_ups
     ${showDone ? '' : 'WHERE done = false'}
     ORDER BY due_date ASC, created_at ASC`
  );
  return res.rows;
}

export async function getDueFollowUps(): Promise<FollowUp[]> {
  await initFollowUpsTable();
  const res = await pool.query(
    `SELECT id, keycloak_user_id AS "keycloakUserId", client_name AS "clientName",
            client_email AS "clientEmail", reason, due_date AS "dueDate", done, created_at AS "createdAt"
     FROM follow_ups
     WHERE done = false AND due_date <= CURRENT_DATE
     ORDER BY due_date ASC`
  );
  return res.rows;
}

export async function updateFollowUp(id: string, params: { done?: boolean; dueDate?: string; reason?: string }): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [id];
  let idx = 2;
  if (params.done !== undefined) { sets.push(`done = $${idx}`); values.push(params.done); idx++; }
  if (params.dueDate) { sets.push(`due_date = $${idx}`); values.push(params.dueDate); idx++; }
  if (params.reason) { sets.push(`reason = $${idx}`); values.push(params.reason); idx++; }
  if (sets.length === 0) return;
  await pool.query(`UPDATE follow_ups SET ${sets.join(', ')} WHERE id = $1`, values);
}

export async function deleteFollowUp(id: string): Promise<void> {
  await pool.query('DELETE FROM follow_ups WHERE id = $1', [id]);
}
```

### Aufgaben-Kalender

- [ ] **Schritt 1.5: `listTasksInMonth`-Funktion**

```typescript
// ── Task Calendar ─────────────────────────────────────────────────────────────

export interface CalendarTask {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  dueDate: Date;
  status: string;
  priority: string;
}

export async function listTasksInMonth(year: number, month: number): Promise<CalendarTask[]> {
  // month: 1-12
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10); // last day of month
  const res = await pool.query(
    `SELECT pt.id, pt.name, pt.project_id AS "projectId", p.name AS "projectName",
            pt.due_date AS "dueDate", pt.status, pt.priority
     FROM project_tasks pt
     JOIN projects p ON p.id = pt.project_id
     WHERE pt.due_date BETWEEN $1 AND $2
     ORDER BY pt.due_date ASC, pt.priority DESC`,
    [start, end]
  );
  return res.rows;
}
```

- [ ] **Schritt 1.6: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(admin): add DB functions for time entries, client notes, onboarding, follow-ups and task calendar"
```

---

## Task 2: Invoice Ninja — getAllInvoices

**Files:**
- Modify: `website/src/lib/invoiceninja.ts`

- [ ] **Schritt 2.1: Typen und Funktion ergänzen**

Am Ende von `website/src/lib/invoiceninja.ts` anfügen:

```typescript
export interface AdminInvoiceListItem extends ClientInvoiceListItem {
  clientName: string;
  clientEmail: string;
}

// List all invoices across all clients (admin overview)
export async function getAllInvoices(params?: {
  statusId?: string;  // '1'=draft,'2'=sent,'3'=partial,'4'=paid,'5'=cancelled,'6'=overdue
  perPage?: number;
}): Promise<AdminInvoiceListItem[]> {
  if (!IN_TOKEN) return [];

  const perPage = params?.perPage ?? 100;
  const statusFilter = params?.statusId ? `&invoice_status_id=${params.statusId}` : '';
  const res = await inApi('GET', `/invoices?sort=date|desc&per_page=${perPage}${statusFilter}`);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.data || []).map((inv: {
    id: string; number: string; date: string; due_date: string;
    amount: number; balance: number; status_id: string;
    client: { name: string; contacts: Array<{ email: string }> };
  }) => ({
    id: inv.id,
    number: inv.number,
    date: inv.date,
    dueDate: inv.due_date,
    amount: inv.amount,
    balance: inv.balance,
    statusId: inv.status_id,
    statusLabel: INVOICE_STATUS_LABELS[inv.status_id] || 'Unbekannt',
    clientName: inv.client?.name ?? '—',
    clientEmail: inv.client?.contacts?.[0]?.email ?? '—',
  }));
}
```

**Achtung:** Die IN-API liefert `client` nur wenn `?include=client` mitgegeben wird. Passe den Endpoint-Aufruf an:

```typescript
const res = await inApi('GET', `/invoices?sort=date|desc&per_page=${perPage}&include=client${statusFilter}`);
```

- [ ] **Schritt 2.2: Commit**

```bash
git add website/src/lib/invoiceninja.ts
git commit -m "feat(admin): add getAllInvoices for admin invoice dashboard"
```

---

## Task 3: API-Routen — Zeiterfassung

**Files:**
- Create: `website/src/pages/api/admin/zeiterfassung/create.ts`
- Create: `website/src/pages/api/admin/zeiterfassung/delete.ts`
- Create: `website/src/pages/api/admin/zeiterfassung/export.ts`

- [ ] **Schritt 3.1: `create.ts` anlegen**

```typescript
// website/src/pages/api/admin/zeiterfassung/create.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createTimeEntry } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(null, { status: 401 });
  }

  const form = await request.formData();
  const projectId = form.get('projectId') as string;
  const taskId    = form.get('taskId') as string | null;
  const description = form.get('description') as string | null;
  const minutesRaw  = form.get('minutes') as string;
  const billable    = form.get('billable') === 'true';
  const entryDate   = form.get('entryDate') as string | null;
  const back        = form.get('_back') as string | null;

  const minutes = parseInt(minutesRaw, 10);
  if (!projectId || isNaN(minutes) || minutes <= 0) {
    const dest = back || '/admin/zeiterfassung';
    return new Response(null, {
      status: 302,
      headers: { Location: `${dest}?error=${encodeURIComponent('Ungültige Eingabe')}` },
    });
  }

  try {
    await createTimeEntry({ projectId, taskId: taskId || undefined, description: description || undefined,
                             minutes, billable, entryDate: entryDate || undefined });
  } catch (err) {
    console.error('[api/zeiterfassung/create]', err);
    const dest = back || '/admin/zeiterfassung';
    return new Response(null, {
      status: 302,
      headers: { Location: `${dest}?error=${encodeURIComponent('Datenbankfehler')}` },
    });
  }

  const dest = back || '/admin/zeiterfassung';
  return new Response(null, { status: 302, headers: { Location: `${dest}?saved=1` } });
};
```

- [ ] **Schritt 3.2: `delete.ts` anlegen**

```typescript
// website/src/pages/api/admin/zeiterfassung/delete.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { deleteTimeEntry } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const form = await request.formData();
  const id   = form.get('id') as string;
  const back = form.get('_back') as string | null;

  if (id) await deleteTimeEntry(id);

  return new Response(null, { status: 302, headers: { Location: back || '/admin/zeiterfassung' } });
};
```

- [ ] **Schritt 3.3: `export.ts` anlegen (CSV für Invoice Ninja)**

```typescript
// website/src/pages/api/admin/zeiterfassung/export.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listAllTimeEntries } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const billableOnly = url.searchParams.get('billable') === 'true';
  const since        = url.searchParams.get('since') || undefined;

  const entries = await listAllTimeEntries({
    billable: billableOnly ? true : undefined,
    since,
  });

  const header = 'Datum,Projekt,Aufgabe,Beschreibung,Minuten,Stunden,Abrechenbar\n';
  const rows = entries.map(e => {
    const stunden = (e.minutes / 60).toFixed(2);
    const datum   = new Date(e.entryDate).toLocaleDateString('de-DE');
    const desc    = (e.description || '').replace(/"/g, '""');
    return `${datum},"${e.projectName}","${e.taskName || ''}","${desc}",${e.minutes},${stunden},${e.billable ? 'Ja' : 'Nein'}`;
  }).join('\n');

  return new Response(header + rows, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="zeiterfassung-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
};
```

- [ ] **Schritt 3.4: Commit**

```bash
git add website/src/pages/api/admin/zeiterfassung/
git commit -m "feat(admin): add time tracking API routes (create, delete, export)"
```

---

## Task 4: Admin-Seite — Zeiterfassung

**Files:**
- Create: `website/src/pages/admin/zeiterfassung.astro`

- [ ] **Schritt 4.1: Seite anlegen**

```astro
---
// website/src/pages/admin/zeiterfassung.astro
import Layout from '../../layouts/Layout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import { listAllTimeEntries, listProjects } from '../../lib/website-db';
import type { TimeEntry, Project } from '../../lib/website-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const BRAND = process.env.BRAND || 'mentolder';
const errorMsg = Astro.url.searchParams.get('error') ?? '';
const saved    = Astro.url.searchParams.get('saved') ?? '';
const filterBillable = Astro.url.searchParams.get('billable') ?? '';

let entries: TimeEntry[] = [];
let projects: Project[] = [];
let dbError = '';

try {
  [entries, projects] = await Promise.all([
    listAllTimeEntries({ billable: filterBillable === 'true' ? true : filterBillable === 'false' ? false : undefined }),
    listProjects({ brand: BRAND }),
  ]);
} catch (err) {
  console.error('[admin/zeiterfassung]', err);
  dbError = 'Datenbankfehler beim Laden.';
}

const totalMinutes   = entries.reduce((s, e) => s + e.minutes, 0);
const billableMinutes = entries.filter(e => e.billable).reduce((s, e) => s + e.minutes, 0);

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${min.toString().padStart(2, '0')}m`;
}
function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const inputCls  = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:border-gold focus:ring-2 focus:ring-gold/20 outline-none';
const selectCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm cursor-pointer focus:border-gold focus:ring-2 focus:ring-gold/20 outline-none';
const labelCls  = 'block text-xs text-muted mb-1';
---

<Layout title="Admin — Zeiterfassung">
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-6xl mx-auto px-6">

      <div class="mb-2">
        <a href="/admin" class="text-muted hover:text-gold text-sm">← Zurück zur Übersicht</a>
      </div>

      <div class="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-3xl font-bold text-light font-serif">Zeiterfassung</h1>
          <p class="text-muted mt-1">{fmtMin(totalMinutes)} gesamt · {fmtMin(billableMinutes)} abrechenbar</p>
        </div>
        <div class="flex gap-3">
          <a href="/api/admin/zeiterfassung/export?billable=true"
            class="px-4 py-2 bg-dark-light border border-dark-lighter text-muted text-sm rounded-lg hover:text-light hover:border-gold/40 transition-colors">
            ↓ CSV (abrechenbar)
          </a>
          <button type="button" id="create-btn"
            class="px-4 py-2 bg-gold hover:bg-gold-light text-dark text-sm font-semibold rounded-lg transition-colors">
            + Zeit buchen
          </button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Einträge',       value: entries.length,                              cls: 'border-dark-lighter' },
          { label: 'Gesamt',         value: fmtMin(totalMinutes),                        cls: 'border-dark-lighter' },
          { label: 'Abrechenbar',    value: fmtMin(billableMinutes),                     cls: 'border-yellow-800' },
          { label: 'Nicht abr.',     value: fmtMin(totalMinutes - billableMinutes),      cls: 'border-dark-lighter' },
        ].map(s => (
          <div class={`p-4 bg-dark-light rounded-xl border ${s.cls}`}>
            <div class="text-xl font-bold text-light">{s.value}</div>
            <div class="text-xs text-muted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {(errorMsg || dbError) && (
        <div id="err-banner" class="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm flex items-start justify-between gap-4">
          <span>{decodeURIComponent((errorMsg || dbError).replace(/\+/g, ' '))}</span>
          <button type="button" onclick="document.getElementById('err-banner').remove()" class="text-red-400 hover:text-red-200 shrink-0">✕</button>
        </div>
      )}
      {saved && (
        <div id="ok-banner" class="mb-6 p-4 bg-green-900/30 border border-green-800 rounded-xl text-green-300 text-sm flex items-start justify-between gap-4">
          <span>Eintrag gespeichert.</span>
          <button type="button" onclick="document.getElementById('ok-banner').remove()" class="text-green-400 hover:text-green-200 shrink-0">✕</button>
        </div>
      )}

      <!-- Filter bar -->
      <div class="flex gap-3 mb-6">
        {[
          { label: 'Alle',           value: '' },
          { label: 'Abrechenbar',    value: 'true' },
          { label: 'Nicht abr.',     value: 'false' },
        ].map(opt => (
          <a href={`/admin/zeiterfassung${opt.value ? '?billable=' + opt.value : ''}`}
            class={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${filterBillable === opt.value ? 'bg-gold text-dark' : 'text-muted hover:text-light'}`}>
            {opt.label}
          </a>
        ))}
      </div>

      <!-- Table -->
      <div class="bg-dark-light rounded-2xl border border-dark-lighter overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-dark-lighter">
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Datum</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Projekt</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Aufgabe</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Beschreibung</th>
              <th class="text-right px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Minuten</th>
              <th class="text-center px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Abr.</th>
              <th class="text-right px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colspan="7" class="px-4 py-10 text-center text-muted text-sm">Keine Einträge vorhanden.</td></tr>
            ) : entries.map(e => (
              <tr class="border-b border-dark-lighter/50 hover:bg-dark/30 transition-colors">
                <td class="px-4 py-3 text-sm text-muted whitespace-nowrap">{fmtDate(e.entryDate)}</td>
                <td class="px-4 py-3 text-sm text-light">
                  <a href={`/admin/projekte/${e.projectId}`} class="hover:text-gold transition-colors">{e.projectName}</a>
                </td>
                <td class="px-4 py-3 text-sm text-muted">{e.taskName ?? '—'}</td>
                <td class="px-4 py-3 text-sm text-muted max-w-[200px] truncate">{e.description ?? '—'}</td>
                <td class="px-4 py-3 text-sm text-light text-right font-mono">{e.minutes} <span class="text-muted">({fmtMin(e.minutes)})</span></td>
                <td class="px-4 py-3 text-center text-sm">{e.billable ? <span class="text-green-400">✓</span> : <span class="text-muted">—</span>}</td>
                <td class="px-4 py-3 text-right">
                  <form method="post" action="/api/admin/zeiterfassung/delete">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="_back" value="/admin/zeiterfassung" />
                    <button type="submit" class="px-3 py-1 text-xs bg-red-900/20 border border-red-900/40 text-red-400 rounded hover:bg-red-900/40 transition-colors"
                      onclick="return confirm('Eintrag löschen?')">
                      Löschen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- Create dialog -->
  <dialog id="create-dialog"
    class="bg-dark-light border border-dark-lighter rounded-2xl p-6 w-full max-w-lg backdrop:bg-black/60">
    <h2 class="text-lg font-semibold text-light mb-4 font-serif">Zeit buchen</h2>
    <form method="post" action="/api/admin/zeiterfassung/create" class="space-y-4">
      <input type="hidden" name="_back" value="/admin/zeiterfassung" />
      <div>
        <label class={labelCls}>Projekt <span class="text-red-400">*</span></label>
        <select name="projectId" required class={selectCls}>
          <option value="">— Projekt wählen —</option>
          {projects.map(p => <option value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class={labelCls}>Minuten <span class="text-red-400">*</span></label>
          <input type="number" name="minutes" min="1" max="1440" required class={inputCls} placeholder="z.B. 90" />
        </div>
        <div>
          <label class={labelCls}>Datum</label>
          <input type="date" name="entryDate" class={inputCls}
            value={new Date().toISOString().slice(0, 10)} />
        </div>
      </div>
      <div>
        <label class={labelCls}>Beschreibung</label>
        <input type="text" name="description" maxlength="500" class={inputCls} />
      </div>
      <div class="flex items-center gap-2">
        <input type="checkbox" name="billable" value="true" id="billable-cb" checked class="accent-gold w-4 h-4" />
        <label for="billable-cb" class="text-sm text-light cursor-pointer">Abrechenbar</label>
      </div>
      <div class="flex gap-3 justify-end pt-2">
        <button type="button" id="create-cancel" class="px-4 py-2 text-sm text-muted hover:text-light transition-colors">Abbrechen</button>
        <button type="submit" class="px-4 py-2 text-sm bg-gold hover:bg-gold-light text-dark font-semibold rounded-lg transition-colors">Speichern</button>
      </div>
    </form>
  </dialog>
</Layout>

<script>
  const dialog = document.getElementById('create-dialog') as HTMLDialogElement;
  document.getElementById('create-btn')?.addEventListener('click', () => dialog.showModal());
  document.getElementById('create-cancel')?.addEventListener('click', () => dialog.close());
</script>
```

- [ ] **Schritt 4.2: Commit**

```bash
git add website/src/pages/admin/zeiterfassung.astro
git commit -m "feat(admin): add Zeiterfassung page with time booking dialog and CSV export"
```

---

## Task 5: Admin-Seite — Rechnungsübersicht

**Files:**
- Create: `website/src/pages/admin/rechnungen.astro`

- [ ] **Schritt 5.1: Seite anlegen**

```astro
---
// website/src/pages/admin/rechnungen.astro
import Layout from '../../layouts/Layout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import { getAllInvoices } from '../../lib/invoiceninja';
import type { AdminInvoiceListItem } from '../../lib/invoiceninja';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const statusFilter = Astro.url.searchParams.get('status') ?? '';

let invoices: AdminInvoiceListItem[] = [];
let apiError = '';
try {
  invoices = await getAllInvoices({ statusId: statusFilter || undefined, perPage: 200 });
} catch (err) {
  console.error('[admin/rechnungen]', err);
  apiError = 'Invoice Ninja nicht erreichbar.';
}

const totalOpen    = invoices.filter(i => i.balance > 0 && i.statusId !== '4' && i.statusId !== '5').reduce((s, i) => s + i.balance, 0);
const totalPaid    = invoices.filter(i => i.statusId === '4').reduce((s, i) => s + i.amount, 0);
const countOverdue = invoices.filter(i => i.statusId === '6').length;

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}
function fmtDate(s: string): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATUS_CLS: Record<string, string> = {
  '1': 'bg-slate-900/40 text-slate-300 border-slate-700',
  '2': 'bg-blue-900/40 text-blue-300 border-blue-800',
  '3': 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  '4': 'bg-green-900/40 text-green-300 border-green-800',
  '5': 'bg-dark border border-dark-lighter text-muted',
  '6': 'bg-red-900/40 text-red-300 border-red-800',
};

const STATUS_TABS = [
  { value: '',  label: 'Alle' },
  { value: '2', label: 'Versendet' },
  { value: '6', label: 'Überfällig' },
  { value: '4', label: 'Bezahlt' },
  { value: '1', label: 'Entwurf' },
  { value: '5', label: 'Storniert' },
];
---

<Layout title="Admin — Rechnungen">
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-6xl mx-auto px-6">
      <div class="mb-2">
        <a href="/admin" class="text-muted hover:text-gold text-sm">← Zurück zur Übersicht</a>
      </div>

      <div class="mb-8">
        <h1 class="text-3xl font-bold text-light font-serif">Rechnungen</h1>
        <p class="text-muted mt-1">{invoices.length} Rechnungen über alle Clients</p>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Offen',       value: fmtCurrency(totalOpen),   cls: totalOpen > 0 ? 'border-yellow-800' : 'border-dark-lighter' },
          { label: 'Bezahlt',     value: fmtCurrency(totalPaid),   cls: 'border-green-800' },
          { label: 'Überfällig',  value: countOverdue,             cls: countOverdue > 0 ? 'border-red-800' : 'border-dark-lighter' },
          { label: 'Gesamt',      value: invoices.length,          cls: 'border-dark-lighter' },
        ].map(s => (
          <div class={`p-4 bg-dark-light rounded-xl border ${s.cls}`}>
            <div class="text-xl font-bold text-light">{s.value}</div>
            <div class="text-xs text-muted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {apiError && (
        <div class="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">{apiError}</div>
      )}

      <!-- Status filter tabs -->
      <div class="flex gap-1 p-1 bg-dark-light rounded-lg border border-dark-lighter mb-6 w-fit">
        {STATUS_TABS.map(t => (
          <a href={`/admin/rechnungen${t.value ? '?status=' + t.value : ''}`}
            class={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${statusFilter === t.value ? 'bg-gold text-dark' : 'text-muted hover:text-light'}`}>
            {t.label}
          </a>
        ))}
      </div>

      <!-- Table -->
      <div class="bg-dark-light rounded-2xl border border-dark-lighter overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-dark-lighter">
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Nr.</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Client</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Status</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Datum</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Fällig</th>
              <th class="text-right px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Betrag</th>
              <th class="text-right px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Offen</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colspan="7" class="px-4 py-10 text-center text-muted text-sm">Keine Rechnungen gefunden.</td></tr>
            ) : invoices.map(inv => (
              <tr class="border-b border-dark-lighter/50 hover:bg-dark/30 transition-colors">
                <td class="px-4 py-3 text-sm text-light font-mono">#{inv.number}</td>
                <td class="px-4 py-3 text-sm text-light">
                  <div>{inv.clientName}</div>
                  <div class="text-xs text-muted">{inv.clientEmail}</div>
                </td>
                <td class="px-4 py-3">
                  <span class={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_CLS[inv.statusId] ?? ''}`}>
                    {inv.statusLabel}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-muted whitespace-nowrap">{fmtDate(inv.date)}</td>
                <td class={`px-4 py-3 text-sm whitespace-nowrap ${inv.statusId === '6' ? 'text-red-400 font-medium' : 'text-muted'}`}>
                  {fmtDate(inv.dueDate)}{inv.statusId === '6' ? ' ⚠' : ''}
                </td>
                <td class="px-4 py-3 text-sm text-light text-right font-medium">{fmtCurrency(inv.amount)}</td>
                <td class={`px-4 py-3 text-sm text-right font-medium ${inv.balance > 0 ? 'text-yellow-400' : 'text-muted'}`}>
                  {inv.balance > 0 ? fmtCurrency(inv.balance) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </section>
</Layout>
```

- [ ] **Schritt 5.2: Commit**

```bash
git add website/src/pages/admin/rechnungen.astro
git commit -m "feat(admin): add Rechnungsübersicht with KPI cards and status filter"
```

---

## Task 6: API-Routen — Kunden-Notizen

**Files:**
- Create: `website/src/pages/api/admin/clientnotes/create.ts`
- Create: `website/src/pages/api/admin/clientnotes/delete.ts`

- [ ] **Schritt 6.1: `create.ts` anlegen**

```typescript
// website/src/pages/api/admin/clientnotes/create.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createClientNote } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const form    = await request.formData();
  const userId  = form.get('keycloakUserId') as string;
  const content = (form.get('content') as string)?.trim();
  const back    = form.get('_back') as string | null;

  if (!userId || !content) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${back || '/admin'}?error=${encodeURIComponent('Notiz darf nicht leer sein')}` },
    });
  }

  try {
    await createClientNote(userId, content);
  } catch (err) {
    console.error('[api/clientnotes/create]', err);
    return new Response(null, {
      status: 302,
      headers: { Location: `${back || '/admin'}?error=${encodeURIComponent('Datenbankfehler')}` },
    });
  }

  return new Response(null, { status: 302, headers: { Location: `${back || '/admin'}?saved=1` } });
};
```

- [ ] **Schritt 6.2: `delete.ts` anlegen**

```typescript
// website/src/pages/api/admin/clientnotes/delete.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { deleteClientNote } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const form = await request.formData();
  const id   = form.get('id') as string;
  const back = form.get('_back') as string | null;

  if (id) await deleteClientNote(id);

  return new Response(null, { status: 302, headers: { Location: back || '/admin' } });
};
```

- [ ] **Schritt 6.3: Commit**

```bash
git add website/src/pages/api/admin/clientnotes/
git commit -m "feat(admin): add client notes API routes"
```

---

## Task 7: Komponente + Tab — Kunden-Notizen

**Files:**
- Create: `website/src/components/portal/ClientNotesTab.astro`
- Modify: `website/src/pages/admin/[clientId].astro`

- [ ] **Schritt 7.1: `ClientNotesTab.astro` anlegen**

```astro
---
// website/src/components/portal/ClientNotesTab.astro
import { listClientNotes } from '../../lib/website-db';

interface Props {
  keycloakUserId: string;
  back: string;
}
const { keycloakUserId, back } = Astro.props;

let notes = [];
try {
  notes = await listClientNotes(keycloakUserId);
} catch {
  // DB unavailable
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
---

<div data-testid="client-notes-tab">
  <h3 class="text-lg font-semibold text-light mb-4">Notizen & Aktivitäten</h3>

  <!-- New note form -->
  <form method="post" action="/api/admin/clientnotes/create" class="mb-6 flex gap-2">
    <input type="hidden" name="keycloakUserId" value={keycloakUserId} />
    <input type="hidden" name="_back" value={back} />
    <textarea name="content" rows="2" maxlength="2000" required
      placeholder="Neue Notiz eingeben …"
      class="flex-1 px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:border-gold focus:ring-2 focus:ring-gold/20 outline-none resize-none"></textarea>
    <button type="submit"
      class="px-4 py-2 bg-gold hover:bg-gold-light text-dark text-sm font-semibold rounded-lg transition-colors self-start">
      Hinzufügen
    </button>
  </form>

  {notes.length === 0 ? (
    <p class="text-muted text-sm">Noch keine Notizen vorhanden.</p>
  ) : (
    <ul class="space-y-3">
      {notes.map(n => (
        <li class="flex gap-3 p-4 bg-dark rounded-xl border border-dark-lighter" data-testid="client-note-item">
          <div class="flex-1">
            <p class="text-light text-sm whitespace-pre-wrap">{n.content}</p>
            <p class="text-xs text-muted mt-1">{fmtDate(n.createdAt)}</p>
          </div>
          <form method="post" action="/api/admin/clientnotes/delete">
            <input type="hidden" name="id" value={n.id} />
            <input type="hidden" name="_back" value={back} />
            <button type="submit"
              class="text-muted hover:text-red-400 transition-colors text-lg leading-none"
              title="Notiz löschen"
              onclick="return confirm('Notiz löschen?')">
              ✕
            </button>
          </form>
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Schritt 7.2: Notizen-Tab in `[clientId].astro` einbauen**

Öffne `website/src/pages/admin/[clientId].astro`.

Füge den Import hinzu (nach den bestehenden Importen):
```typescript
import ClientNotesTab from '../../components/portal/ClientNotesTab.astro';
```

Füge `{ id: 'notes', label: 'Notizen' }` ins Tab-Array ein:
```typescript
{ id: 'bookings', label: 'Termine' },
{ id: 'invoices', label: 'Rechnungen' },
{ id: 'notes',    label: 'Notizen' },      // NEU
{ id: 'files',    label: 'Dateien' },
{ id: 'signatures', label: 'Zur Unterschrift' },
{ id: 'meetings', label: 'Besprechungen' },
```

Füge den Tab-Inhalt hinzu (nach den bestehenden `{tab === ...}` Blöcken):
```astro
{tab === 'notes' && (
  <ClientNotesTab
    keycloakUserId={clientId}
    back={`/admin/${clientId}?tab=notes`}
  />
)}
```

- [ ] **Schritt 7.3: Commit**

```bash
git add website/src/components/portal/ClientNotesTab.astro
git add website/src/pages/admin/\[clientId\].astro
git commit -m "feat(admin): add client notes tab with create/delete API"
```

---

## Task 8: Admin Dashboard — KPI-Kacheln

**Files:**
- Modify: `website/src/pages/admin.astro`

- [ ] **Schritt 8.1: Imports und KPI-Daten ergänzen**

Ersetze den Frontmatter-Block in `website/src/pages/admin.astro`:

```typescript
---
import Layout from '../layouts/Layout.astro';
import { getSession, getLoginUrl, isAdmin } from '../lib/auth';
import { listBugTickets, listProjects, getDueFollowUps } from '../lib/website-db';
import { getAllInvoices } from '../lib/invoiceninja';
import { getAvailableSlots } from '../lib/caldav';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/portal');

const BRAND = process.env.BRAND || 'mentolder';

let openBugCount   = 0;
let activeProjects = 0;
let openInvoices   = 0;
let openInvoiceAmount = 0;
let dueFollowUps   = 0;
let freeSlots      = 0;

await Promise.allSettled([
  listBugTickets({ status: 'open', brand: BRAND, limit: 1000 })
    .then(t => { openBugCount = t.length; }),
  listProjects({ brand: BRAND, status: 'aktiv' })
    .then(p => { activeProjects = p.length; }),
  getAllInvoices({ perPage: 200 })
    .then(inv => {
      const open = inv.filter(i => i.balance > 0 && !['4','5'].includes(i.statusId));
      openInvoices = open.length;
      openInvoiceAmount = open.reduce((s, i) => s + i.balance, 0);
    }),
  getDueFollowUps()
    .then(f => { dueFollowUps = f.length; }),
  getAvailableSlots(new Date())
    .then(slots => {
      const horizon = new Date(); horizon.setDate(horizon.getDate() + 7);
      freeSlots = slots.filter(d => new Date(d.date) <= horizon)
                       .reduce((s, d) => s + d.slots.length, 0);
    }),
]);

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}
---
```

- [ ] **Schritt 8.2: KPI-Banner und neue Tiles einfügen**

Füge nach `<div class="mb-10">` (dem Header-Block) und vor dem `<!-- Dashboard grid -->` folgendes ein:

```astro
<!-- KPI Banner -->
<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
  {[
    { label: 'Aktive Projekte',   value: activeProjects,           href: '/admin/projekte',      cls: 'border-yellow-800' },
    { label: 'Offene Rechnungen', value: openInvoices > 0 ? `${openInvoices} (${fmtCurrency(openInvoiceAmount)})` : '0', href: '/admin/rechnungen', cls: openInvoices > 0 ? 'border-yellow-800' : 'border-dark-lighter' },
    { label: 'Überfällige Bugs',  value: openBugCount,             href: '/admin/bugs',          cls: openBugCount > 0 ? 'border-red-800' : 'border-dark-lighter' },
    { label: 'Follow-ups fällig', value: dueFollowUps,             href: '/admin/followups',     cls: dueFollowUps > 0 ? 'border-red-800' : 'border-dark-lighter' },
    { label: 'Freie Slots (7 T)', value: freeSlots,                href: '/admin/termine',       cls: freeSlots > 0 ? 'border-green-800' : 'border-dark-lighter' },
  ].map(k => (
    <a href={k.href} class={`p-4 bg-dark-light rounded-xl border hover:border-gold/40 transition-colors ${k.cls}`}>
      <div class="text-xl font-bold text-light">{k.value}</div>
      <div class="text-xs text-muted mt-0.5">{k.label}</div>
    </a>
  ))}
</div>
```

- [ ] **Schritt 8.3: Neue Tool-Tiles ins Grid anfügen**

Füge nach der letzten `<a href="/admin/projekte">` Tile drei neue Tiles ins Grid:

```astro
<!-- Zeiterfassung -->
<a href="/admin/zeiterfassung" class="group p-6 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors">
  <div class="text-3xl mb-3">⏱️</div>
  <h2 class="text-light font-semibold text-lg group-hover:text-gold transition-colors">Zeiterfassung</h2>
  <p class="text-muted text-sm mt-1">Stunden auf Projekte buchen · CSV-Export für Invoice Ninja</p>
</a>

<!-- Rechnungen -->
<a href="/admin/rechnungen" class="group p-6 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors">
  <div class="text-3xl mb-3">💶</div>
  <h2 class="text-light font-semibold text-lg group-hover:text-gold transition-colors">Rechnungen</h2>
  <p class="text-muted text-sm mt-1">Alle Rechnungen im Überblick · Status und offene Beträge</p>
</a>

<!-- Follow-ups -->
<a href="/admin/followups" class="relative group p-6 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors">
  {dueFollowUps > 0 && (
    <span class="absolute top-4 right-4 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
      {dueFollowUps > 99 ? '99+' : dueFollowUps}
    </span>
  )}
  <div class="text-3xl mb-3">🔔</div>
  <h2 class="text-light font-semibold text-lg group-hover:text-gold transition-colors">Follow-ups</h2>
  <p class="text-muted text-sm mt-1">Wiedervorlagen · fällige Erinnerungen an Clients</p>
</a>

<!-- Kalender -->
<a href="/admin/kalender" class="group p-6 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors">
  <div class="text-3xl mb-3">🗓️</div>
  <h2 class="text-light font-semibold text-lg group-hover:text-gold transition-colors">Aufgaben-Kalender</h2>
  <p class="text-muted text-sm mt-1">Alle Aufgaben mit Fälligkeit in der Monatsansicht</p>
</a>
```

- [ ] **Schritt 8.4: Commit**

```bash
git add website/src/pages/admin.astro
git commit -m "feat(admin): add KPI banner and new tool tiles to admin dashboard"
```

---

## Task 9: API-Routen + Komponente — Onboarding-Checkliste

**Files:**
- Create: `website/src/pages/api/admin/onboarding/update.ts`
- Create: `website/src/pages/api/admin/onboarding/reset.ts`
- Create: `website/src/components/portal/OnboardingTab.astro`
- Modify: `website/src/pages/admin/[clientId].astro`

- [ ] **Schritt 9.1: `update.ts` anlegen**

```typescript
// website/src/pages/api/admin/onboarding/update.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { toggleOnboardingItem } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const form = await request.formData();
  const id   = form.get('id') as string;
  const done = form.get('done') === 'true';
  const back = form.get('_back') as string | null;

  if (id) await toggleOnboardingItem(id, done);

  return new Response(null, { status: 302, headers: { Location: back || '/admin' } });
};
```

- [ ] **Schritt 9.2: `reset.ts` anlegen**

```typescript
// website/src/pages/api/admin/onboarding/reset.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { resetOnboardingChecklist } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const form   = await request.formData();
  const userId = form.get('keycloakUserId') as string;
  const back   = form.get('_back') as string | null;

  if (userId) await resetOnboardingChecklist(userId);

  return new Response(null, { status: 302, headers: { Location: back || '/admin' } });
};
```

- [ ] **Schritt 9.3: `OnboardingTab.astro` anlegen**

```astro
---
// website/src/components/portal/OnboardingTab.astro
import { getOrCreateOnboardingChecklist } from '../../lib/website-db';

interface Props {
  keycloakUserId: string;
  back: string;
}
const { keycloakUserId, back } = Astro.props;

let items = [];
try {
  items = await getOrCreateOnboardingChecklist(keycloakUserId);
} catch {
  // DB unavailable
}

const doneCount = items.filter(i => i.done).length;
const pct       = items.length ? Math.round((doneCount / items.length) * 100) : 0;
---

<div data-testid="onboarding-tab">
  <div class="flex items-center justify-between mb-4">
    <div>
      <h3 class="text-lg font-semibold text-light">Onboarding-Checkliste</h3>
      <p class="text-sm text-muted mt-0.5">{doneCount}/{items.length} Schritte abgeschlossen</p>
    </div>
    <form method="post" action="/api/admin/onboarding/reset">
      <input type="hidden" name="keycloakUserId" value={keycloakUserId} />
      <input type="hidden" name="_back" value={back} />
      <button type="submit"
        class="px-3 py-1.5 text-xs bg-dark border border-dark-lighter text-muted rounded-lg hover:text-light hover:border-gold/40 transition-colors"
        onclick="return confirm('Checkliste zurücksetzen?')">
        Zurücksetzen
      </button>
    </form>
  </div>

  <!-- Progress bar -->
  <div class="w-full bg-dark rounded-full h-2 mb-6 overflow-hidden">
    <div class={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : 'bg-gold'}`}
      style={`width: ${pct}%`}></div>
  </div>

  <ul class="space-y-2">
    {items.map(item => (
      <li class="flex items-center gap-3 p-3 bg-dark rounded-xl border border-dark-lighter"
        data-testid="onboarding-item">
        <form method="post" action="/api/admin/onboarding/update" class="contents">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="done" value={item.done ? 'false' : 'true'} />
          <input type="hidden" name="_back" value={back} />
          <button type="submit"
            class={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
              ${item.done
                ? 'border-green-500 bg-green-500/20 text-green-400 hover:bg-green-500/30'
                : 'border-dark-lighter text-transparent hover:border-gold'}`}>
            {item.done ? '✓' : ''}
          </button>
        </form>
        <span class={`text-sm ${item.done ? 'text-muted line-through' : 'text-light'}`}>
          {item.label}
        </span>
      </li>
    ))}
  </ul>
</div>
```

- [ ] **Schritt 9.4: Onboarding-Tab in `[clientId].astro` einbauen**

Füge den Import hinzu:
```typescript
import OnboardingTab from '../../components/portal/OnboardingTab.astro';
```

Füge `{ id: 'onboarding', label: 'Onboarding' }` ins Tab-Array ein (nach Notizen):
```typescript
{ id: 'notes',      label: 'Notizen' },
{ id: 'onboarding', label: 'Onboarding' },   // NEU
```

Füge den Tab-Inhalt hinzu:
```astro
{tab === 'onboarding' && (
  <OnboardingTab
    keycloakUserId={clientId}
    back={`/admin/${clientId}?tab=onboarding`}
  />
)}
```

- [ ] **Schritt 9.5: Commit**

```bash
git add website/src/pages/api/admin/onboarding/
git add website/src/components/portal/OnboardingTab.astro
git add website/src/pages/admin/\[clientId\].astro
git commit -m "feat(admin): add onboarding checklist with progress bar and reset"
```

---

## Task 10: API-Routen — Follow-up-System

**Files:**
- Create: `website/src/pages/api/admin/followups/create.ts`
- Create: `website/src/pages/api/admin/followups/update.ts`
- Create: `website/src/pages/api/admin/followups/delete.ts`
- Create: `website/src/pages/api/admin/followups/notify.ts`

- [ ] **Schritt 10.1: `create.ts` anlegen**

```typescript
// website/src/pages/api/admin/followups/create.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createFollowUp } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const form      = await request.formData();
  const reason    = (form.get('reason') as string)?.trim();
  const dueDate   = form.get('dueDate') as string;
  const clientName  = form.get('clientName') as string | null;
  const clientEmail = form.get('clientEmail') as string | null;
  const userId    = form.get('keycloakUserId') as string | null;
  const back      = form.get('_back') as string | null;

  if (!reason || !dueDate) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${back || '/admin/followups'}?error=${encodeURIComponent('Grund und Datum erforderlich')}` },
    });
  }

  try {
    await createFollowUp({
      reason, dueDate,
      keycloakUserId: userId || undefined,
      clientName: clientName || undefined,
      clientEmail: clientEmail || undefined,
    });
  } catch (err) {
    console.error('[api/followups/create]', err);
    return new Response(null, {
      status: 302,
      headers: { Location: `${back || '/admin/followups'}?error=${encodeURIComponent('Datenbankfehler')}` },
    });
  }

  return new Response(null, { status: 302, headers: { Location: `${back || '/admin/followups'}?saved=1` } });
};
```

- [ ] **Schritt 10.2: `update.ts` anlegen**

```typescript
// website/src/pages/api/admin/followups/update.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updateFollowUp } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const form    = await request.formData();
  const id      = form.get('id') as string;
  const done    = form.get('done');
  const dueDate = form.get('dueDate') as string | null;
  const reason  = form.get('reason') as string | null;
  const back    = form.get('_back') as string | null;

  if (!id) return new Response(null, { status: 302, headers: { Location: back || '/admin/followups' } });

  await updateFollowUp(id, {
    done: done !== null ? done === 'true' : undefined,
    dueDate: dueDate || undefined,
    reason: reason || undefined,
  });

  return new Response(null, { status: 302, headers: { Location: back || '/admin/followups' } });
};
```

- [ ] **Schritt 10.3: `delete.ts` anlegen**

```typescript
// website/src/pages/api/admin/followups/delete.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { deleteFollowUp } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const form = await request.formData();
  const id   = form.get('id') as string;
  const back = form.get('_back') as string | null;

  if (id) await deleteFollowUp(id);

  return new Response(null, { status: 302, headers: { Location: back || '/admin/followups' } });
};
```

- [ ] **Schritt 10.4: `notify.ts` anlegen (Mattermost-Benachrichtigung)**

```typescript
// website/src/pages/api/admin/followups/notify.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getDueFollowUps } from '../../../../lib/website-db';
import { postWebhook } from '../../../../lib/mattermost';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const due = await getDueFollowUps();
  if (due.length === 0) {
    return Response.json({ sent: false, message: 'Keine fälligen Follow-ups.' });
  }

  const lines = due.map(f => {
    const client = f.clientName ?? f.clientEmail ?? 'Unbekannt';
    const date   = new Date(f.dueDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `• **${client}** — ${f.reason} (fällig: ${date})`;
  });

  const message = `### 🔔 Follow-up Erinnerung\n\n${lines.join('\n')}\n\n[Follow-ups öffnen](/admin/followups)`;

  const sent = await postWebhook({ text: message });

  return Response.json({ sent, count: due.length });
};
```

- [ ] **Schritt 10.5: Commit**

```bash
git add website/src/pages/api/admin/followups/
git commit -m "feat(admin): add follow-up API routes with Mattermost notification"
```

---

## Task 11: Admin-Seite — Follow-ups

**Files:**
- Create: `website/src/pages/admin/followups.astro`

- [ ] **Schritt 11.1: Seite anlegen**

```astro
---
// website/src/pages/admin/followups.astro
import Layout from '../../layouts/Layout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import { listFollowUps } from '../../lib/website-db';
import type { FollowUp } from '../../lib/website-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const showDone = Astro.url.searchParams.get('done') === '1';
const errorMsg = Astro.url.searchParams.get('error') ?? '';
const saved    = Astro.url.searchParams.get('saved')  ?? '';

let followUps: FollowUp[] = [];
let dbError = '';
try {
  followUps = await listFollowUps(showDone);
} catch (err) {
  console.error('[admin/followups]', err);
  dbError = 'Datenbankfehler beim Laden der Follow-ups.';
}

const today = new Date(); today.setHours(0,0,0,0);
const dueCount = followUps.filter(f => !f.done && new Date(f.dueDate) <= today).length;

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const inputCls  = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:border-gold focus:ring-2 focus:ring-gold/20 outline-none';
const labelCls  = 'block text-xs text-muted mb-1';
---

<Layout title="Admin — Follow-ups">
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-4xl mx-auto px-6">

      <div class="mb-2">
        <a href="/admin" class="text-muted hover:text-gold text-sm">← Zurück zur Übersicht</a>
      </div>

      <div class="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-3xl font-bold text-light font-serif">Follow-ups</h1>
          <p class="text-muted mt-1">{followUps.length} {showDone ? 'gesamt' : 'offen'} · {dueCount > 0 ? `${dueCount} fällig` : 'keine fällig'}</p>
        </div>
        <div class="flex gap-3">
          <button type="button" id="notify-btn"
            class="px-4 py-2 bg-dark-light border border-dark-lighter text-muted text-sm rounded-lg hover:text-light hover:border-gold/40 transition-colors">
            Mattermost Reminder
          </button>
          <button type="button" id="create-btn"
            class="px-4 py-2 bg-gold hover:bg-gold-light text-dark text-sm font-semibold rounded-lg transition-colors">
            + Follow-up
          </button>
        </div>
      </div>

      {(errorMsg || dbError) && (
        <div id="err-banner" class="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm flex items-start justify-between gap-4">
          <span>{decodeURIComponent((errorMsg || dbError).replace(/\+/g, ' '))}</span>
          <button type="button" onclick="document.getElementById('err-banner').remove()" class="text-red-400 hover:text-red-200 shrink-0">✕</button>
        </div>
      )}
      {saved && (
        <div id="ok-banner" class="mb-6 p-4 bg-green-900/30 border border-green-800 rounded-xl text-green-300 text-sm flex items-start justify-between gap-4">
          <span>Follow-up gespeichert.</span>
          <button type="button" onclick="document.getElementById('ok-banner').remove()" class="text-green-400 hover:text-green-200 shrink-0">✕</button>
        </div>
      )}

      <!-- Filter toggle -->
      <div class="flex gap-3 mb-6">
        <a href="/admin/followups"
          class={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${!showDone ? 'bg-gold text-dark' : 'text-muted hover:text-light'}`}>
          Offen
        </a>
        <a href="/admin/followups?done=1"
          class={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${showDone ? 'bg-gold text-dark' : 'text-muted hover:text-light'}`}>
          Alle (inkl. erledigt)
        </a>
      </div>

      <!-- List -->
      <div class="space-y-3">
        {followUps.length === 0 && (
          <div class="p-10 text-center bg-dark-light rounded-2xl border border-dark-lighter">
            <p class="text-muted">Keine Follow-ups vorhanden.</p>
          </div>
        )}
        {followUps.map(f => {
          const isOverdue = !f.done && new Date(f.dueDate) <= today;
          return (
            <div class={`flex items-start gap-4 p-4 bg-dark-light rounded-xl border transition-colors ${f.done ? 'opacity-50 border-dark-lighter' : isOverdue ? 'border-red-800' : 'border-dark-lighter'}`}
              data-testid="followup-item">
              <!-- Done toggle -->
              <form method="post" action="/api/admin/followups/update" class="mt-0.5">
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="done" value={f.done ? 'false' : 'true'} />
                <input type="hidden" name="_back" value={Astro.url.pathname + Astro.url.search} />
                <button type="submit"
                  class={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors
                    ${f.done ? 'border-green-500 bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'border-dark-lighter text-transparent hover:border-gold'}`}>
                  {f.done ? '✓' : ''}
                </button>
              </form>
              <!-- Content -->
              <div class="flex-1 min-w-0">
                <p class={`text-sm font-medium ${f.done ? 'text-muted line-through' : 'text-light'}`}>{f.reason}</p>
                {(f.clientName || f.clientEmail) && (
                  <p class="text-xs text-muted mt-0.5">{f.clientName ?? ''} {f.clientEmail ? `· ${f.clientEmail}` : ''}</p>
                )}
                <p class={`text-xs mt-1 font-medium ${isOverdue ? 'text-red-400' : 'text-muted'}`}>
                  Fällig: {fmtDate(f.dueDate)}{isOverdue ? ' ⚠ Überfällig' : ''}
                </p>
              </div>
              <!-- Delete -->
              <form method="post" action="/api/admin/followups/delete">
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="_back" value={Astro.url.pathname + Astro.url.search} />
                <button type="submit"
                  class="text-muted hover:text-red-400 transition-colors text-lg leading-none"
                  title="Löschen" onclick="return confirm('Follow-up löschen?')">
                  ✕
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  </section>

  <!-- Create dialog -->
  <dialog id="create-dialog"
    class="bg-dark-light border border-dark-lighter rounded-2xl p-6 w-full max-w-lg backdrop:bg-black/60">
    <h2 class="text-lg font-semibold text-light mb-4 font-serif">Neues Follow-up</h2>
    <form method="post" action="/api/admin/followups/create" class="space-y-4">
      <input type="hidden" name="_back" value="/admin/followups" />
      <div>
        <label class={labelCls}>Grund / Erinnerung <span class="text-red-400">*</span></label>
        <input type="text" name="reason" required maxlength="500" class={inputCls}
          placeholder="z.B. Angebot nachfassen" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class={labelCls}>Client-Name</label>
          <input type="text" name="clientName" maxlength="200" class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Client-E-Mail</label>
          <input type="email" name="clientEmail" maxlength="200" class={inputCls} />
        </div>
      </div>
      <div>
        <label class={labelCls}>Fälligkeitsdatum <span class="text-red-400">*</span></label>
        <input type="date" name="dueDate" required class={inputCls}
          value={new Date(Date.now() + 7*86400*1000).toISOString().slice(0,10)} />
      </div>
      <div class="flex gap-3 justify-end pt-2">
        <button type="button" id="create-cancel" class="px-4 py-2 text-sm text-muted hover:text-light transition-colors">Abbrechen</button>
        <button type="submit" class="px-4 py-2 text-sm bg-gold hover:bg-gold-light text-dark font-semibold rounded-lg transition-colors">Erstellen</button>
      </div>
    </form>
  </dialog>
</Layout>

<script>
  const dialog = document.getElementById('create-dialog') as HTMLDialogElement;
  document.getElementById('create-btn')?.addEventListener('click', () => dialog.showModal());
  document.getElementById('create-cancel')?.addEventListener('click', () => dialog.close());

  // Mattermost reminder button
  document.getElementById('notify-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('notify-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Sende …';
    try {
      const res = await fetch('/api/admin/followups/notify', { method: 'POST' });
      const data = await res.json();
      btn.textContent = data.sent ? `✓ ${data.count} versendet` : 'Keine fälligen';
    } catch {
      btn.textContent = 'Fehler';
    }
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Mattermost Reminder'; }, 3000);
  });
</script>
```

- [ ] **Schritt 11.2: Commit**

```bash
git add website/src/pages/admin/followups.astro
git commit -m "feat(admin): add Follow-ups page with done toggle, overdue highlight and Mattermost notify"
```

---

## Task 12: Admin-Seite — Aufgaben-Kalender

**Files:**
- Create: `website/src/pages/admin/kalender.astro`

- [ ] **Schritt 12.1: Seite anlegen**

```astro
---
// website/src/pages/admin/kalender.astro
import Layout from '../../layouts/Layout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import { listTasksInMonth } from '../../lib/website-db';
import type { CalendarTask } from '../../lib/website-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const now     = new Date();
const yearQ   = parseInt(Astro.url.searchParams.get('year')  ?? String(now.getFullYear()), 10);
const monthQ  = parseInt(Astro.url.searchParams.get('month') ?? String(now.getMonth() + 1), 10);
const year    = isNaN(yearQ)  ? now.getFullYear()  : yearQ;
const month   = isNaN(monthQ) ? now.getMonth() + 1 : Math.max(1, Math.min(12, monthQ));

let tasks: CalendarTask[] = [];
let dbError = '';
try {
  tasks = await listTasksInMonth(year, month);
} catch (err) {
  console.error('[admin/kalender]', err);
  dbError = 'Datenbankfehler beim Laden.';
}

// Build calendar grid
const firstDay  = new Date(year, month - 1, 1);
const lastDay   = new Date(year, month, 0);
const startWeekday = (firstDay.getDay() + 6) % 7; // Mon=0
const totalDays = lastDay.getDate();

// Map tasks by day
const tasksByDay = new Map<number, CalendarTask[]>();
for (const t of tasks) {
  const d = new Date(t.dueDate).getDate();
  if (!tasksByDay.has(d)) tasksByDay.set(d, []);
  tasksByDay.get(d)!.push(t);
}

// Prev/next month navigation
function navUrl(y: number, m: number): string {
  if (m < 1)  { y--; m = 12; }
  if (m > 12) { y++; m = 1; }
  return `/admin/kalender?year=${y}&month=${m}`;
}

const MONTH_NAMES = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const DAY_NAMES   = ['Mo','Di','Mi','Do','Fr','Sa','So'];

const PRIO_DOT: Record<string, string> = {
  hoch: 'bg-red-500', mittel: 'bg-yellow-500', niedrig: 'bg-green-500',
};
const STATUS_CLS: Record<string, string> = {
  erledigt: 'line-through opacity-50',
  archiviert: 'line-through opacity-30',
};
---

<Layout title="Admin — Aufgaben-Kalender">
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-5xl mx-auto px-6">

      <div class="mb-2">
        <a href="/admin" class="text-muted hover:text-gold text-sm">← Zurück zur Übersicht</a>
      </div>

      <!-- Header with navigation -->
      <div class="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold text-light font-serif">Aufgaben-Kalender</h1>
          <p class="text-muted mt-1">{tasks.length} Aufgaben mit Fälligkeit im {MONTH_NAMES[month - 1]} {year}</p>
        </div>
        <div class="flex items-center gap-2">
          <a href={navUrl(year, month - 1)}
            class="px-3 py-2 bg-dark-light border border-dark-lighter text-muted rounded-lg hover:text-light hover:border-gold/40 transition-colors text-sm">
            ← Vorheriger
          </a>
          <a href={`/admin/kalender?year=${now.getFullYear()}&month=${now.getMonth() + 1}`}
            class="px-3 py-2 bg-dark-light border border-dark-lighter text-muted rounded-lg hover:text-light hover:border-gold/40 transition-colors text-sm">
            Heute
          </a>
          <a href={navUrl(year, month + 1)}
            class="px-3 py-2 bg-dark-light border border-dark-lighter text-muted rounded-lg hover:text-light hover:border-gold/40 transition-colors text-sm">
            Nächster →
          </a>
        </div>
      </div>

      {dbError && (
        <div class="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">{dbError}</div>
      )}

      <!-- Calendar grid -->
      <div class="bg-dark-light rounded-2xl border border-dark-lighter overflow-hidden">
        <!-- Day headers -->
        <div class="grid grid-cols-7 border-b border-dark-lighter">
          {DAY_NAMES.map(d => (
            <div class={`px-2 py-3 text-center text-xs font-semibold text-muted ${['Sa','So'].includes(d) ? 'text-muted/60' : ''}`}>
              {d}
            </div>
          ))}
        </div>

        <!-- Day cells -->
        <div class="grid grid-cols-7">
          {/* Leading empty cells */}
          {Array.from({ length: startWeekday }).map(() => (
            <div class="min-h-[100px] border-b border-r border-dark-lighter/50 bg-dark/30"></div>
          ))}

          {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
            const isToday = year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate();
            const dayTasks = tasksByDay.get(day) ?? [];
            const col = (startWeekday + day - 1) % 7; // 0=Mon, 5=Sat, 6=Sun
            const isWeekend = col >= 5;
            return (
              <div class={`min-h-[100px] border-b border-r border-dark-lighter/50 p-2 transition-colors hover:bg-dark/30 ${isWeekend ? 'bg-dark/20' : ''}`}>
                <div class={`text-xs font-semibold mb-1.5 w-6 h-6 flex items-center justify-center rounded-full
                  ${isToday ? 'bg-gold text-dark' : 'text-muted'}`}>
                  {day}
                </div>
                <div class="space-y-1">
                  {dayTasks.slice(0, 3).map(t => (
                    <a href={`/admin/projekte/${t.projectId}`}
                      class={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-dark border border-dark-lighter hover:border-gold/40 transition-colors group ${STATUS_CLS[t.status] ?? ''}`}
                      title={`${t.name} — ${t.projectName}`}>
                      <span class={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIO_DOT[t.priority] ?? 'bg-dark-lighter'}`}></span>
                      <span class="truncate text-muted group-hover:text-light transition-colors">{t.name}</span>
                    </a>
                  ))}
                  {dayTasks.length > 3 && (
                    <p class="text-xs text-muted pl-1">+{dayTasks.length - 3} weitere</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Trailing empty cells to fill last row */}
          {(() => {
            const trailing = (7 - (startWeekday + totalDays) % 7) % 7;
            return Array.from({ length: trailing }).map(() => (
              <div class="min-h-[100px] border-b border-r border-dark-lighter/50 bg-dark/30"></div>
            ));
          })()}
        </div>
      </div>

      <!-- Legend -->
      <div class="flex gap-4 mt-4 text-xs text-muted">
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500"></span> Hoch</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-yellow-500"></span> Mittel</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500"></span> Niedrig</span>
      </div>
    </div>
  </section>
</Layout>
```

- [ ] **Schritt 12.2: Commit**

```bash
git add website/src/pages/admin/kalender.astro
git commit -m "feat(admin): add Aufgaben-Kalender with monthly grid and priority dots"
```

---

## Task 13: Zeiterfassung in Projektdetail einbinden

Damit man Zeit direkt aus dem Projekt buchen und sehen kann.

**Files:**
- Modify: `website/src/pages/admin/projekte/[id].astro`

- [ ] **Schritt 13.1: Zeiterfassungs-Sektion in Projektdetail-Seite einbauen**

Lies `website/src/pages/admin/projekte/[id].astro`. Füge diese Änderungen ein:

**Import** am Anfang des Frontmatters (nach den bestehenden Importen):
```typescript
import { listTimeEntries, getProjectTotalMinutes } from '../../../lib/website-db';
import type { TimeEntry } from '../../../lib/website-db';
```

**Daten laden** (innerhalb des try-Blocks nach den anderen Queries):
```typescript
const [timeEntries, timeStats] = await Promise.all([
  listTimeEntries(id),
  getProjectTotalMinutes(id),
]);

function fmtMin(m: number): string {
  return `${Math.floor(m / 60)}h ${(m % 60).toString().padStart(2, '0')}m`;
}
```

**UI-Block** — Füge nach dem letzten bestehenden Abschnitt (z.B. Aufgaben-Sektion) eine neue Sektion ein:

```astro
<!-- Zeiterfassung -->
<section class="mt-10">
  <div class="flex items-center justify-between mb-4">
    <div>
      <h2 class="text-xl font-semibold text-light font-serif">Zeiterfassung</h2>
      <p class="text-muted text-sm mt-0.5">
        {fmtMin(timeStats.total)} gesamt · {fmtMin(timeStats.billable)} abrechenbar
      </p>
    </div>
    <button type="button" id="time-create-btn"
      class="px-3 py-1.5 bg-gold hover:bg-gold-light text-dark text-sm font-semibold rounded-lg transition-colors">
      + Zeit buchen
    </button>
  </div>

  {timeEntries.length === 0 ? (
    <p class="text-muted text-sm">Noch keine Einträge.</p>
  ) : (
    <div class="bg-dark-light rounded-xl border border-dark-lighter overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="border-b border-dark-lighter">
            <th class="text-left px-3 py-2 text-xs text-muted uppercase tracking-wide font-medium">Datum</th>
            <th class="text-left px-3 py-2 text-xs text-muted uppercase tracking-wide font-medium">Aufgabe</th>
            <th class="text-left px-3 py-2 text-xs text-muted uppercase tracking-wide font-medium">Beschreibung</th>
            <th class="text-right px-3 py-2 text-xs text-muted uppercase tracking-wide font-medium">Minuten</th>
            <th class="text-center px-3 py-2 text-xs text-muted uppercase tracking-wide font-medium">Abr.</th>
            <th class="text-right px-3 py-2 text-xs text-muted uppercase tracking-wide font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {timeEntries.map(e => (
            <tr class="border-b border-dark-lighter/50 hover:bg-dark/30 transition-colors">
              <td class="px-3 py-2 text-xs text-muted whitespace-nowrap">
                {new Date(e.entryDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </td>
              <td class="px-3 py-2 text-xs text-muted">{e.taskName ?? '—'}</td>
              <td class="px-3 py-2 text-xs text-muted max-w-[160px] truncate">{e.description ?? '—'}</td>
              <td class="px-3 py-2 text-xs text-light text-right font-mono">{e.minutes}</td>
              <td class="px-3 py-2 text-center text-xs">{e.billable ? <span class="text-green-400">✓</span> : <span class="text-muted">—</span>}</td>
              <td class="px-3 py-2 text-right">
                <form method="post" action="/api/admin/zeiterfassung/delete">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="_back" value={`/admin/projekte/${id}`} />
                  <button type="submit"
                    class="text-muted hover:text-red-400 transition-colors text-sm"
                    onclick="return confirm('Eintrag löschen?')">
                    ✕
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</section>

<!-- Zeit-buchen Dialog (inline for this project) -->
<dialog id="time-create-dialog"
  class="bg-dark-light border border-dark-lighter rounded-2xl p-6 w-full max-w-md backdrop:bg-black/60">
  <h2 class="text-lg font-semibold text-light mb-4 font-serif">Zeit buchen</h2>
  <form method="post" action="/api/admin/zeiterfassung/create" class="space-y-4">
    <input type="hidden" name="projectId" value={id} />
    <input type="hidden" name="_back" value={`/admin/projekte/${id}`} />
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-xs text-muted mb-1">Minuten <span class="text-red-400">*</span></label>
        <input type="number" name="minutes" min="1" max="1440" required
          class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:border-gold focus:ring-2 focus:ring-gold/20 outline-none"
          placeholder="z.B. 90" />
      </div>
      <div>
        <label class="block text-xs text-muted mb-1">Datum</label>
        <input type="date" name="entryDate"
          class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:border-gold focus:ring-2 focus:ring-gold/20 outline-none"
          value={new Date().toISOString().slice(0, 10)} />
      </div>
    </div>
    <div>
      <label class="block text-xs text-muted mb-1">Aufgabe (optional)</label>
      <select name="taskId"
        class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm cursor-pointer focus:border-gold focus:ring-2 focus:ring-gold/20 outline-none">
        <option value="">— keine Aufgabe —</option>
        {project.tasks?.map((t: { id: string; name: string }) => <option value={t.id}>{t.name}</option>)}
      </select>
    </div>
    <div>
      <label class="block text-xs text-muted mb-1">Beschreibung</label>
      <input type="text" name="description" maxlength="500"
        class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:border-gold focus:ring-2 focus:ring-gold/20 outline-none" />
    </div>
    <div class="flex items-center gap-2">
      <input type="checkbox" name="billable" value="true" id="time-billable-cb" checked class="accent-gold w-4 h-4" />
      <label for="time-billable-cb" class="text-sm text-light cursor-pointer">Abrechenbar</label>
    </div>
    <div class="flex gap-3 justify-end pt-2">
      <button type="button" id="time-create-cancel" class="px-4 py-2 text-sm text-muted hover:text-light transition-colors">Abbrechen</button>
      <button type="submit" class="px-4 py-2 text-sm bg-gold hover:bg-gold-light text-dark font-semibold rounded-lg transition-colors">Speichern</button>
    </div>
  </form>
</dialog>
```

**Script-Block** — Füge zum bestehenden `<script>`-Block hinzu:
```javascript
const timeDialog = document.getElementById('time-create-dialog') as HTMLDialogElement;
document.getElementById('time-create-btn')?.addEventListener('click', () => timeDialog.showModal());
document.getElementById('time-create-cancel')?.addEventListener('click', () => timeDialog.close());
```

**Hinweis:** Das `project.tasks`-Array muss aus dem bestehenden Projektdetail-Query verfügbar sein. Prüfe, ob `[id].astro` die Tasks lädt — falls nicht, ergänze `listTasksForProject(id)` im Frontmatter.

- [ ] **Schritt 13.2: Commit**

```bash
git add website/src/pages/admin/projekte/
git commit -m "feat(admin): embed time tracking section in project detail page"
```

---

## Manuelle Verifikation nach Implementierung

Nach jeder Task kann lokal verifiziert werden:

```bash
# Cluster muss laufen
task cluster:status

# Website neu deployen
task website:redeploy

# Smoke tests
./tests/runner.sh local FA-01   # Basic website accessibility
./tests/runner.sh local FA-12   # Admin login
```

**Individuelle Checks:**

```bash
# Zeiterfassung — Tabelle prüfen
task workspace:psql -- website
SELECT * FROM time_entries LIMIT 5;

# Follow-ups — fällige abrufen
SELECT * FROM follow_ups WHERE done = false AND due_date <= CURRENT_DATE;

# Onboarding — Default-Items für Test-User
SELECT * FROM onboarding_items WHERE keycloak_user_id = '<user-uuid>';

# Rechnungen — Invoice Ninja API
kubectl exec -n workspace deploy/website -- \
  curl -s "http://invoiceninja.workspace.svc.cluster.local/api/v1/invoices?include=client&per_page=5" \
  -H "X-Api-Token: $INVOICENINJA_API_TOKEN" | jq '.data | length'
```

---

## Deployment-Reihenfolge

Die Tasks sind unabhängig voneinander und können in beliebiger Reihenfolge implementiert werden. Empfohlene Reihenfolge für minimales Risiko:

1. Task 1 (DB-Schicht) — Fundament für alle anderen
2. Task 2 (Invoice Ninja) — isoliert, kein DB-Risiko
3. Task 3+4 (Zeiterfassung API + Seite)
4. Task 5 (Rechnungsübersicht)
5. Task 6+7 (Client Notes)
6. Task 8 (Dashboard KPIs — baut auf Tasks 1+2 auf)
7. Task 9 (Onboarding)
8. Task 10+11 (Follow-ups)
9. Task 12 (Kalender)
10. Task 13 (Zeiterfassung in Projektdetail)
