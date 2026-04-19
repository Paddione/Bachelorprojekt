# Monatliche Abrechnung abrechenbarer Zeiteinträge — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abrechenbare Zeiteinträge werden monatlich pro Kunde zu Stripe-Draft-Invoices zusammengefasst; der Admin bearbeitet Positionen vollständig im Admin-Panel und versendet von dort.

**Architecture:** `time_entries` bekommt `rate_cents` (Stundensatz bei Buchung) und `stripe_invoice_id` (gesetzt wenn abgerechnet). Ein monatlicher Cron-Trigger aggregiert unbezahlte Einträge nach Kunde und erstellt Stripe-Draft-Invoices. Das Admin-Panel zeigt einen Badge und eine vollständige Bearbeitungs-UI; finalisieren/versenden geschieht via Stripe API.

**Tech Stack:** Astro SSR, TypeScript, Stripe SDK (`stripe`), PostgreSQL (via `pool.query`), Kubernetes CronJob

---

## Dateikarte

| Datei | Änderung |
|-------|----------|
| `website/src/lib/website-db.ts` | Schema, Interface, Funktionen für `time_entries` erweitern |
| `website/src/pages/admin/zeiterfassung.astro` | Rate-Feld im Formular + Vorbelegen |
| `website/src/pages/api/admin/zeiterfassung/create.ts` | `rate_cents` aus FormData lesen |
| `website/src/lib/stripe-billing.ts` | Draft-Invoice-Lifecycle-Funktionen |
| `website/src/pages/api/admin/billing/create-monthly-invoices.ts` | POST — Cron-Trigger |
| `website/src/pages/api/admin/billing/draft-count.ts` | GET — Badge-Zähler |
| `website/src/pages/api/admin/billing/drafts.ts` | GET — Liste aller Drafts |
| `website/src/pages/api/admin/billing/[id]/index.ts` | GET — Detail einer Draft (Items von Stripe) |
| `website/src/pages/api/admin/billing/[id]/item.ts` | POST/PATCH/DELETE — Line Items bearbeiten |
| `website/src/pages/api/admin/billing/[id]/send.ts` | POST — Finalisieren + versenden |
| `website/src/pages/api/admin/billing/[id]/discard.ts` | POST — Draft verwerfen, time_entries freigeben |
| `website/src/pages/admin/rechnungen.astro` | Badge + Draft-Sektion + Detail-Editor |
| `k3d/cronjob-monthly-billing.yaml` | Kubernetes CronJob (1. des Monats) |
| `k3d/kustomization.yaml` | CronJob-Manifest referenzieren |

---

## Task 1: Schema und DB-Funktionen erweitern

**Files:**
- Modify: `website/src/lib/website-db.ts`

### Schritt 1.1 — `TimeEntry` Interface erweitern

- [ ] In `website/src/lib/website-db.ts` das Interface `TimeEntry` (Zeile ~1217) um zwei Felder erweitern:

```typescript
export interface TimeEntry {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskName: string | null;
  description: string | null;
  minutes: number;
  billable: boolean;
  rateCents: number;
  stripeInvoiceId: string | null;
  entryDate: Date;
  createdAt: Date;
}
```

### Schritt 1.2 — `initTimeEntriesTable` um neue Spalten erweitern

- [ ] In `initTimeEntriesTable` (Zeile ~1230) die `CREATE TABLE`-Query um die neuen Spalten ergänzen und `ALTER TABLE`-Statements hinzufügen (idempotent für bestehende Installationen):

```typescript
async function initTimeEntriesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task_id           UUID        REFERENCES project_tasks(id) ON DELETE SET NULL,
      description       TEXT,
      minutes           INTEGER     NOT NULL CHECK (minutes > 0),
      billable          BOOLEAN     NOT NULL DEFAULT true,
      rate_cents        INTEGER     NOT NULL DEFAULT 0,
      stripe_invoice_id TEXT,
      entry_date        DATE        NOT NULL DEFAULT CURRENT_DATE,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS time_entries_project_id_idx ON time_entries(project_id)
  `);
  // Idempotent migrations for existing tables
  await pool.query(`
    ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS rate_cents        INTEGER DEFAULT 0
  `);
  await pool.query(`
    ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT
  `);
}
```

### Schritt 1.3 — `getLastTimeEntryRate` Funktion hinzufügen

- [ ] Nach `initTimeEntriesTable` eine neue Export-Funktion hinzufügen:

```typescript
export async function getLastTimeEntryRate(): Promise<number> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `SELECT rate_cents FROM time_entries ORDER BY created_at DESC LIMIT 1`
  );
  return result.rows[0]?.rate_cents ?? 0;
}
```

### Schritt 1.4 — `createTimeEntry` um `rateCents` erweitern

- [ ] Signatur und Query von `createTimeEntry` (Zeile ~1248) anpassen:

```typescript
export async function createTimeEntry(params: {
  projectId: string;
  taskId?: string;
  description?: string;
  minutes: number;
  billable?: boolean;
  rateCents?: number;
  entryDate?: string;
}): Promise<TimeEntry> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `INSERT INTO time_entries (project_id, task_id, description, minutes, billable, rate_cents, entry_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      params.projectId,
      params.taskId ?? null,
      params.description ?? null,
      params.minutes,
      params.billable ?? true,
      params.rateCents ?? 0,
      params.entryDate ?? null,
    ]
  );
  return (await listTimeEntries(params.projectId)).find(
    (e) => e.id === result.rows[0].id
  ) as TimeEntry;
}
```

### Schritt 1.5 — SELECT-Queries in `listTimeEntries` und `listAllTimeEntries` um neue Felder erweitern

- [ ] In `listTimeEntries` (Zeile ~1286) die SELECT-Liste erweitern:

```typescript
  const result = await pool.query(
    `SELECT te.id,
            te.project_id         AS "projectId",
            p.name                AS "projectName",
            te.task_id            AS "taskId",
            pt.name               AS "taskName",
            te.description,
            te.minutes,
            te.billable,
            te.rate_cents         AS "rateCents",
            te.stripe_invoice_id  AS "stripeInvoiceId",
            te.entry_date         AS "entryDate",
            te.created_at         AS "createdAt"
     FROM time_entries te
     JOIN projects      p  ON p.id  = te.project_id
     LEFT JOIN project_tasks pt ON pt.id = te.task_id
     WHERE te.project_id = $1
     ORDER BY te.entry_date DESC`,
    [projectId]
  );
```

- [ ] Dieselbe SELECT-Erweiterung in `listAllTimeEntries` (Zeile ~1309):

```typescript
  const result = await pool.query(
    `SELECT te.id,
            te.project_id         AS "projectId",
            p.name                AS "projectName",
            te.task_id            AS "taskId",
            pt.name               AS "taskName",
            te.description,
            te.minutes,
            te.billable,
            te.rate_cents         AS "rateCents",
            te.stripe_invoice_id  AS "stripeInvoiceId",
            te.entry_date         AS "entryDate",
            te.created_at         AS "createdAt"
     FROM time_entries te
     JOIN projects      p  ON p.id  = te.project_id
     LEFT JOIN project_tasks pt ON pt.id = te.task_id
     WHERE ($1::boolean IS NULL OR te.billable = $1)
       AND ($2::date    IS NULL OR te.entry_date >= $2::date)
     ORDER BY te.entry_date DESC`,
    [params?.billable ?? null, params?.since ?? null]
  );
```

### Schritt 1.6 — `setTimeEntryStripeInvoice` Hilfsfunktion hinzufügen

- [ ] Nach `listAllTimeEntries` einfügen:

```typescript
export async function setTimeEntryStripeInvoice(
  ids: string[],
  stripeInvoiceId: string | null
): Promise<void> {
  if (ids.length === 0) return;
  await initTimeEntriesTable();
  await pool.query(
    `UPDATE time_entries SET stripe_invoice_id = $1 WHERE id = ANY($2::uuid[])`,
    [stripeInvoiceId, ids]
  );
}
```

### Schritt 1.7 — `getUnbilledBillableEntriesByCustomer` hinzufügen

- [ ] Funktion für den Cron-Job, die unbezahlte abrechenbare Einträge nach Kunde gruppiert:

```typescript
export interface UnbilledCustomerGroup {
  customerId: string;
  customerName: string;
  customerEmail: string;
  entries: Array<{
    id: string;
    projectId: string;
    projectName: string;
    description: string | null;
    minutes: number;
    rateCents: number;
    entryDate: Date;
  }>;
}

export async function getUnbilledBillableEntriesByCustomer(
  year: number,
  month: number  // 1-12
): Promise<UnbilledCustomerGroup[]> {
  await initTimeEntriesTable();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate   = new Date(year, month, 0).toISOString().slice(0, 10); // last day of month
  const result = await pool.query(
    `SELECT te.id,
            te.project_id        AS "projectId",
            p.name               AS "projectName",
            te.description,
            te.minutes,
            te.rate_cents        AS "rateCents",
            te.entry_date        AS "entryDate",
            c.id                 AS "customerId",
            c.name               AS "customerName",
            c.email              AS "customerEmail"
     FROM time_entries te
     JOIN projects  p ON p.id = te.project_id
     JOIN customers c ON c.id = p.customer_id
     WHERE te.billable = true
       AND te.stripe_invoice_id IS NULL
       AND te.entry_date BETWEEN $1 AND $2`,
    [startDate, endDate]
  );

  const byCustomer = new Map<string, UnbilledCustomerGroup>();
  for (const row of result.rows) {
    if (!byCustomer.has(row.customerId)) {
      byCustomer.set(row.customerId, {
        customerId: row.customerId,
        customerName: row.customerName,
        customerEmail: row.customerEmail,
        entries: [],
      });
    }
    byCustomer.get(row.customerId)!.entries.push({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      description: row.description,
      minutes: row.minutes,
      rateCents: row.rateCents,
      entryDate: row.entryDate,
    });
  }
  return [...byCustomer.values()];
}
```

### Schritt 1.8 — Commit

- [ ] Änderungen committen:

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(db): add rate_cents + stripe_invoice_id to time_entries"
```

---

## Task 2: Zeiterfassungsformular um Stundensatz erweitern

**Files:**
- Modify: `website/src/pages/admin/zeiterfassung.astro`
- Modify: `website/src/pages/api/admin/zeiterfassung/create.ts`

### Schritt 2.1 — Letzten Stundensatz im Astro-Frontmatter laden

- [ ] In `zeiterfassung.astro` im Frontmatter-Block `getLastTimeEntryRate` importieren und aufrufen:

```typescript
import { getLastTimeEntryRate, /* ...bestehende imports */ } from '../../lib/website-db';

// bestehende Aufrufe...
const lastRate = await getLastTimeEntryRate();
```

### Schritt 2.2 — Rate-Feld ins Formular einfügen

- [ ] Im Formular nach dem Minuten/Datum-Grid (Zeile ~185 in `zeiterfassung.astro`) ein neues Feld einfügen, direkt vor der Beschreibung:

```astro
<div>
  <label class={labelCls}>Stundensatz (€/h)</label>
  <input
    type="number"
    name="rateCents"
    min="0"
    step="1"
    required
    class={inputCls}
    placeholder="z.B. 100"
    value={Math.round(lastRate / 100)}
  />
  <p class="text-xs text-muted mt-1">Betrag in Euro. Letzter Wert wurde vorbelegt.</p>
</div>
```

### Schritt 2.3 — `create.ts` um `rateCents` erweitern

- [ ] In `create.ts` den `rateCents`-Wert aus FormData lesen und an `createTimeEntry` übergeben:

```typescript
const rateCentsRaw = form.get('rateCents') as string;
const rateCents    = Math.round(parseFloat(rateCentsRaw || '0') * 100);

// ...im createTimeEntry-Aufruf:
await createTimeEntry({
  projectId,
  taskId: taskId || undefined,
  description: description || undefined,
  minutes,
  billable,
  rateCents,
  entryDate: entryDate || undefined,
});
```

### Schritt 2.4 — Manuell testen

- [ ] `task website:dev` starten
- [ ] Admin-Panel öffnen → Zeiterfassung → Neuer Eintrag
- [ ] Prüfen: Rate-Feld ist vorbelegt (0 beim ersten Eintrag, letzter Wert danach)
- [ ] Eintrag speichern, in der Tabelle kontrollieren:
  ```bash
  task workspace:psql -- website
  SELECT rate_cents FROM time_entries ORDER BY created_at DESC LIMIT 3;
  ```

### Schritt 2.5 — Commit

```bash
git add website/src/pages/admin/zeiterfassung.astro \
        website/src/pages/api/admin/zeiterfassung/create.ts
git commit -m "feat(zeiterfassung): add hourly rate field with last-value prefill"
```

---

## Task 3: Stripe-Billing-Funktionen für Draft-Invoice-Lifecycle

**Files:**
- Modify: `website/src/lib/stripe-billing.ts`

### Schritt 3.1 — Typen für Draft-Invoice-Detail hinzufügen

- [ ] Am Ende der Typ-Definitionen in `stripe-billing.ts` (nach `AdminBillingInvoice`) einfügen:

```typescript
export interface DraftInvoiceItem {
  lineItemId: string;
  invoiceItemId: string;
  description: string;
  hours: number;
  rateCents: number;
  amountCents: number;
}

export interface DraftInvoiceDetail extends AdminBillingInvoice {
  period: string;  // e.g. "März 2026"
  items: DraftInvoiceItem[];
}
```

### Schritt 3.2 — `createMonthlyDraftInvoices` hinzufügen

- [ ] Am Ende von `stripe-billing.ts` einfügen:

```typescript
export async function createMonthlyDraftInvoices(
  groups: import('./website-db').UnbilledCustomerGroup[],
  periodLabel: string
): Promise<Map<string, string>> {
  // Returns Map<customerId, stripeInvoiceId>
  const result = new Map<string, string>();
  if (!process.env.STRIPE_SECRET_KEY) return result;

  for (const group of groups) {
    const customer = await getOrCreateCustomer({
      name: group.customerName,
      email: group.customerEmail,
    });
    if (!customer) continue;

    // Group entries by project
    const byProject = new Map<string, typeof group.entries>();
    for (const entry of group.entries) {
      if (!byProject.has(entry.projectId)) byProject.set(entry.projectId, []);
      byProject.get(entry.projectId)!.push(entry);
    }

    const draft = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: 14,
      auto_advance: false,
      description: `Zeitabrechnung ${periodLabel}`,
    });

    for (const [, entries] of byProject) {
      const projectName  = entries[0].projectName;
      const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0);
      const totalHours   = totalMinutes / 60;
      // Weighted average rate
      const weightedRateCents = totalMinutes > 0
        ? Math.round(entries.reduce((s, e) => s + e.rateCents * e.minutes, 0) / totalMinutes)
        : 0;
      const amountCents = Math.round(totalHours * weightedRateCents);

      const descriptions = entries
        .map(e => e.description)
        .filter(Boolean)
        .join('; ');
      const lineDescription = descriptions
        ? `${projectName} — ${periodLabel}: ${descriptions}`
        : `${projectName} — ${periodLabel}`;

      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: draft.id,
        amount: amountCents,
        currency: 'eur',
        description: lineDescription,
        metadata: {
          project_id:  entries[0].projectId,
          hours:       totalHours.toFixed(2),
          rate_cents:  weightedRateCents.toString(),
        },
      });
    }

    result.set(group.customerId, draft.id);
  }
  return result;
}
```

### Schritt 3.3 — `getDraftInvoiceCount` hinzufügen

```typescript
export async function getDraftInvoiceCount(): Promise<number> {
  if (!process.env.STRIPE_SECRET_KEY) return 0;
  const result = await stripe.invoices.list({ status: 'draft', limit: 100 });
  return result.data.length;
}
```

### Schritt 3.4 — `getDraftInvoices` hinzufügen

```typescript
export async function getDraftInvoices(): Promise<AdminBillingInvoice[]> {
  if (!process.env.STRIPE_SECRET_KEY) return [];
  const result = await stripe.invoices.list({
    status: 'draft',
    limit: 100,
    expand: ['data.customer'],
  });
  return result.data.map(inv => {
    const customer = typeof inv.customer === 'object' && inv.customer !== null
      ? (inv.customer as Stripe.Customer)
      : null;
    return { ...mapInvoice(inv), customerName: customer?.name ?? '—', customerEmail: customer?.email ?? '—' };
  });
}
```

### Schritt 3.5 — `getDraftInvoiceDetail` hinzufügen

```typescript
export async function getDraftInvoiceDetail(invoiceId: string): Promise<DraftInvoiceDetail | null> {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const inv = await stripe.invoices.retrieve(invoiceId, {
    expand: ['customer', 'lines.data.invoice_item'],
  });
  if (inv.status !== 'draft') return null;

  const customer = typeof inv.customer === 'object' && inv.customer !== null
    ? (inv.customer as Stripe.Customer)
    : null;

  const items: DraftInvoiceItem[] = inv.lines.data.map(line => {
    const ii            = line.invoice_item;
    const invoiceItemId = typeof ii === 'string' ? ii : (ii as Stripe.InvoiceItem)?.id ?? '';
    const meta          = (typeof ii === 'object' && ii) ? (ii as Stripe.InvoiceItem).metadata : {};
    const rateCents     = parseInt(meta?.rate_cents ?? '0', 10);
    const hours         = parseFloat(meta?.hours ?? '0');
    return {
      lineItemId:     line.id,
      invoiceItemId,
      description:    line.description ?? '',
      hours,
      rateCents,
      amountCents:    line.amount,
    };
  });

  const period = inv.description?.replace('Zeitabrechnung ', '') ?? '';

  return {
    ...mapInvoice(inv),
    customerName: customer?.name ?? '—',
    customerEmail: customer?.email ?? '—',
    period,
    items,
  };
}
```

### Schritt 3.6 — `updateDraftInvoiceItem` hinzufügen

```typescript
export async function updateDraftInvoiceItem(
  invoiceItemId: string,
  params: { description?: string; hours?: number; rateCents?: number }
): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  const { hours, rateCents } = params;
  const amountCents = hours !== undefined && rateCents !== undefined
    ? Math.round(hours * rateCents)
    : undefined;

  await stripe.invoiceItems.update(invoiceItemId, {
    ...(params.description !== undefined ? { description: params.description } : {}),
    ...(amountCents !== undefined        ? { amount: amountCents }             : {}),
    ...((hours !== undefined || rateCents !== undefined) ? {
      metadata: {
        ...(hours     !== undefined ? { hours:      hours.toFixed(2)       } : {}),
        ...(rateCents !== undefined ? { rate_cents: rateCents.toString()   } : {}),
      },
    } : {}),
  });
}
```

### Schritt 3.7 — `addDraftInvoiceItem` hinzufügen

```typescript
export async function addDraftInvoiceItem(
  invoiceId:  string,
  customerId: string,
  params: { description: string; hours: number; rateCents: number }
): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  const amountCents = Math.round(params.hours * params.rateCents);
  await stripe.invoiceItems.create({
    customer: customerId,
    invoice:  invoiceId,
    amount:   amountCents,
    currency: 'eur',
    description: params.description,
    metadata: {
      hours:      params.hours.toFixed(2),
      rate_cents: params.rateCents.toString(),
    },
  });
}
```

### Schritt 3.8 — `deleteDraftInvoiceItem` hinzufügen

```typescript
export async function deleteDraftInvoiceItem(invoiceItemId: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  await stripe.invoiceItems.del(invoiceItemId);
}
```

### Schritt 3.9 — `sendDraftInvoice` hinzufügen

```typescript
export async function sendDraftInvoice(invoiceId: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  await stripe.invoices.finalizeInvoice(invoiceId);
  await stripe.invoices.sendInvoice(invoiceId);
}
```

### Schritt 3.10 — `discardDraftInvoice` hinzufügen

```typescript
export async function discardDraftInvoice(invoiceId: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  const inv = await stripe.invoices.retrieve(invoiceId, {
    expand: ['lines.data.invoice_item'],
  });
  for (const line of inv.lines.data) {
    const ii   = line.invoice_item;
    const iiId = typeof ii === 'string' ? ii : (ii as Stripe.InvoiceItem)?.id;
    if (iiId) await stripe.invoiceItems.del(iiId).catch(() => {});
  }
  await stripe.invoices.del(invoiceId);
}
```

### Schritt 3.11 — Commit

```bash
git add website/src/lib/stripe-billing.ts
git commit -m "feat(billing): add draft invoice lifecycle functions"
```

---

## Task 4: API-Endpoints

**Files:**
- Create: `website/src/pages/api/admin/billing/create-monthly-invoices.ts`
- Create: `website/src/pages/api/admin/billing/draft-count.ts`
- Create: `website/src/pages/api/admin/billing/drafts.ts`
- Create: `website/src/pages/api/admin/billing/[id]/index.ts`
- Create: `website/src/pages/api/admin/billing/[id]/item.ts`
- Create: `website/src/pages/api/admin/billing/[id]/send.ts`
- Create: `website/src/pages/api/admin/billing/[id]/discard.ts`

### Schritt 4.1 — Verzeichnisstruktur anlegen

- [ ] Verzeichnisse anlegen:

```bash
mkdir -p website/src/pages/api/admin/billing/\[id\]
```

### Schritt 4.2 — `create-monthly-invoices.ts`

- [ ] Datei erstellen:

```typescript
// website/src/pages/api/admin/billing/create-monthly-invoices.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import {
  getUnbilledBillableEntriesByCustomer,
  setTimeEntryStripeInvoice,
} from '../../../../lib/website-db';
import { createMonthlyDraftInvoices } from '../../../../lib/stripe-billing';

export const POST: APIRoute = async ({ request }) => {
  const cronSecret  = request.headers.get('X-Cron-Secret');
  const session     = await getSession(request.headers.get('cookie'));
  const isCron      = cronSecret && cronSecret === process.env.CRON_SECRET;
  const isAdminUser = session && isAdmin(session);
  if (!isCron && !isAdminUser) return new Response(null, { status: 403 });

  // Default: Vormonat
  const body  = await request.json().catch(() => ({}));
  const now   = new Date();
  const year  = body.year  ?? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const month = body.month ?? (now.getMonth() === 0 ? 12 : now.getMonth()); // 1-12

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('de-DE', {
    month: 'long', year: 'numeric',
  });

  const groups = await getUnbilledBillableEntriesByCustomer(year, month);
  if (groups.length === 0) {
    return Response.json({ created: 0, message: 'Keine abrechenbaren Einträge gefunden.' });
  }

  const invoiceMap = await createMonthlyDraftInvoices(groups, monthLabel);

  for (const group of groups) {
    const invoiceId = invoiceMap.get(group.customerId);
    if (invoiceId) {
      await setTimeEntryStripeInvoice(group.entries.map(e => e.id), invoiceId);
    }
  }

  return Response.json({ created: invoiceMap.size, period: monthLabel });
};
```

### Schritt 4.3 — `draft-count.ts`

- [ ] Datei erstellen:

```typescript
// website/src/pages/api/admin/billing/draft-count.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getDraftInvoiceCount } from '../../../../lib/stripe-billing';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  const count = await getDraftInvoiceCount();
  return Response.json({ count });
};
```

### Schritt 4.4 — `drafts.ts`

- [ ] Datei erstellen:

```typescript
// website/src/pages/api/admin/billing/drafts.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getDraftInvoices } from '../../../../lib/stripe-billing';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  const drafts = await getDraftInvoices();
  return Response.json(drafts);
};
```

### Schritt 4.5 — `[id]/index.ts`

- [ ] Datei erstellen:

```typescript
// website/src/pages/api/admin/billing/[id]/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getDraftInvoiceDetail } from '../../../../../lib/stripe-billing';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  const detail = await getDraftInvoiceDetail(params.id!);
  if (!detail) return new Response(null, { status: 404 });
  return Response.json(detail);
};
```

### Schritt 4.6 — `[id]/item.ts`

- [ ] Datei erstellen:

```typescript
// website/src/pages/api/admin/billing/[id]/item.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  addDraftInvoiceItem,
  updateDraftInvoiceItem,
  deleteDraftInvoiceItem,
} from '../../../../../lib/stripe-billing';
import { stripe } from '../../../../../lib/stripe';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const body = await request.json();
  const inv  = await stripe.invoices.retrieve(params.id!);
  const customerId = typeof inv.customer === 'string' ? inv.customer : (inv.customer as { id: string })?.id ?? '';

  await addDraftInvoiceItem(params.id!, customerId, {
    description: String(body.description ?? ''),
    hours:       parseFloat(String(body.hours ?? '0')),
    rateCents:   Math.round(parseFloat(String(body.rateCents ?? '0')) * 100),
  });
  return new Response(null, { status: 204 });
};

export const PATCH: APIRoute = async ({ request, params: _params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const body = await request.json();
  await updateDraftInvoiceItem(String(body.invoiceItemId), {
    description: body.description !== undefined ? String(body.description) : undefined,
    hours:       body.hours       !== undefined ? parseFloat(String(body.hours))       : undefined,
    rateCents:   body.rateCents   !== undefined ? Math.round(parseFloat(String(body.rateCents)) * 100) : undefined,
  });
  return new Response(null, { status: 204 });
};

export const DELETE: APIRoute = async ({ request, params: _params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const body = await request.json();
  await deleteDraftInvoiceItem(String(body.invoiceItemId));
  return new Response(null, { status: 204 });
};
```

### Schritt 4.7 — `[id]/send.ts`

- [ ] Datei erstellen:

```typescript
// website/src/pages/api/admin/billing/[id]/send.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { sendDraftInvoice } from '../../../../../lib/stripe-billing';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  await sendDraftInvoice(params.id!);
  return new Response(null, { status: 204 });
};
```

### Schritt 4.8 — `[id]/discard.ts`

- [ ] Datei erstellen:

```typescript
// website/src/pages/api/admin/billing/[id]/discard.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { discardDraftInvoice } from '../../../../../lib/stripe-billing';
import { setTimeEntryStripeInvoice } from '../../../../../lib/website-db';
import pool from '../../../../../lib/db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const invoiceId = params.id!;
  const result    = await pool.query<{ id: string }>(
    `SELECT id FROM time_entries WHERE stripe_invoice_id = $1`,
    [invoiceId]
  );
  const ids = result.rows.map(r => r.id);

  await discardDraftInvoice(invoiceId);
  await setTimeEntryStripeInvoice(ids, null);

  return new Response(null, { status: 204 });
};
```

### Schritt 4.9 — Commit

```bash
git add website/src/pages/api/admin/billing/
git commit -m "feat(api): add billing draft invoice endpoints"
```

---

## Task 5: Admin-UI — Badge und Draft-Editor in rechnungen.astro

**Files:**
- Modify: `website/src/pages/admin/rechnungen.astro`

### Schritt 5.1 — `getDraftInvoices` im Frontmatter laden

- [ ] In `rechnungen.astro` im Frontmatter-Block ergänzen:

```typescript
import { getDraftInvoices } from '../../lib/stripe-billing';

const draftInvoices = await getDraftInvoices();
```

### Schritt 5.2 — Badge-Span im Navigations-Einstiegspunkt

- [ ] Im Template dort, wo "Rechnungen" verlinkt ist (AdminLayout oder direkt auf der Seite), einen Badge-Span einfügen:

```astro
<span
  id="draft-badge"
  class={draftInvoices.length > 0
    ? "ml-2 bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5"
    : "hidden"}
>
  {draftInvoices.length}
</span>
```

### Schritt 5.3 — Draft-Sektion im Template

- [ ] Oben in `rechnungen.astro` (vor der bestehenden Rechnungsliste) einfügen:

```astro
{draftInvoices.length > 0 && (
  <section class="mb-8">
    <h2 class="text-lg font-semibold text-light mb-4">
      Ausstehende Monatsrechnungen
      <span class="ml-2 text-sm font-normal text-muted">({draftInvoices.length})</span>
    </h2>
    <div class="space-y-3" id="draft-list">
      {draftInvoices.map(inv => (
        <div
          class="bg-surface border border-border rounded-xl p-4 flex items-center justify-between gap-4"
          data-invoice-id={inv.id}
        >
          <div>
            <p class="font-semibold text-light">{inv.customerName}</p>
            <p class="text-sm text-muted">{inv.customerEmail}</p>
            <p class="text-sm text-muted mt-1">
              Betrag: <span class="text-light font-medium">
                {inv.amountDue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </span>
            </p>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            <button
              class="open-draft-btn px-3 py-1.5 text-sm bg-surface-hover border border-border rounded-lg hover:border-gold transition-colors"
              data-id={inv.id}
            >
              Bearbeiten
            </button>
            <button
              class="discard-draft-btn px-3 py-1.5 text-sm text-red-400 border border-border rounded-lg hover:border-red-400 transition-colors"
              data-id={inv.id}
            >
              Verwerfen
            </button>
          </div>
        </div>
      ))}
    </div>
  </section>
)}
```

*Hinweis:* Es werden `data-id`-Attribute statt Inline-`onclick` verwendet — kein Risiko für XSS durch serverseitige Daten.

### Schritt 5.4 — Draft-Editor Dialog

- [ ] Am Ende des Templates (vor `</AdminLayout>`) einfügen:

```astro
<dialog id="draft-editor" class="bg-surface border border-border rounded-2xl p-6 w-full max-w-3xl backdrop:bg-black/60">
  <div class="flex items-center justify-between mb-6">
    <h3 class="text-lg font-semibold text-light">Rechnung bearbeiten</h3>
    <button id="editor-close" class="text-muted hover:text-light transition-colors text-xl" aria-label="Schließen">✕</button>
  </div>

  <p id="editor-customer" class="mb-4 text-sm text-muted"></p>

  <table class="w-full text-sm mb-4">
    <thead>
      <tr class="text-muted border-b border-border">
        <th class="text-left py-2 pr-3 font-medium">Beschreibung</th>
        <th class="text-right py-2 px-3 font-medium w-24">Stunden</th>
        <th class="text-right py-2 px-3 font-medium w-28">€/h</th>
        <th class="text-right py-2 px-3 font-medium w-28">Betrag</th>
        <th class="py-2 w-10"></th>
      </tr>
    </thead>
    <tbody id="editor-items"></tbody>
    <tfoot>
      <tr class="border-t border-border font-semibold text-light">
        <td colspan="3" class="py-3 pr-3">Gesamt</td>
        <td class="py-3 px-3 text-right" id="editor-total"></td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <button id="add-item-btn" class="text-sm text-gold hover:text-gold-light mb-6 transition-colors">
    + Position hinzufügen
  </button>

  <div class="flex gap-3 justify-end">
    <button id="editor-discard-btn"
      class="px-4 py-2 text-sm text-red-400 border border-border rounded-lg hover:border-red-400 transition-colors">
      Verwerfen
    </button>
    <button id="editor-send-btn"
      class="px-4 py-2 text-sm bg-gold hover:bg-gold-light text-dark font-semibold rounded-lg transition-colors">
      Versenden
    </button>
  </div>
</dialog>
```

### Schritt 5.5 — Client-Script (XSS-sicher via DOM-Methoden)

- [ ] Am Ende der Seite einfügen. Alle User-Daten werden via `textContent` oder `value` gesetzt — kein `innerHTML` mit dynamischen Daten:

```astro
<script>
  interface DraftItem {
    invoiceItemId: string;
    description: string;
    hours: number;
    rateCents: number;
    amountCents: number;
  }

  let currentInvoiceId: string | null = null;

  const dialog      = document.getElementById('draft-editor') as HTMLDialogElement;
  const itemsBody   = document.getElementById('editor-items')!;
  const totalCell   = document.getElementById('editor-total')!;
  const customerEl  = document.getElementById('editor-customer')!;

  document.getElementById('editor-close')!.addEventListener('click', () => dialog.close());

  function formatEur(cents: number): string {
    return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }

  function recalcTotal(): void {
    let total = 0;
    document.querySelectorAll<HTMLElement>('[data-amount]').forEach(el => {
      total += parseInt(el.dataset.amount ?? '0', 10);
    });
    totalCell.textContent = formatEur(total);
  }

  function renderItem(item: DraftItem): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-border';
    tr.dataset.itemId = item.invoiceItemId;

    // Description cell
    const descTd = document.createElement('td');
    descTd.className = 'py-2 pr-3';
    const descInput = document.createElement('input');
    descInput.className = 'w-full bg-transparent text-light focus:outline-none focus:ring-1 focus:ring-gold rounded px-1';
    descInput.dataset.field = 'description';
    descInput.value = item.description;
    descTd.appendChild(descInput);

    // Hours cell
    const hoursTd = document.createElement('td');
    hoursTd.className = 'py-2 px-3';
    const hoursInput = document.createElement('input');
    hoursInput.type = 'number';
    hoursInput.min = '0';
    hoursInput.step = '0.25';
    hoursInput.className = 'w-full bg-transparent text-light text-right focus:outline-none focus:ring-1 focus:ring-gold rounded px-1';
    hoursInput.dataset.field = 'hours';
    hoursInput.value = item.hours.toFixed(2);
    hoursTd.appendChild(hoursInput);

    // Rate cell
    const rateTd = document.createElement('td');
    rateTd.className = 'py-2 px-3';
    const rateInput = document.createElement('input');
    rateInput.type = 'number';
    rateInput.min = '0';
    rateInput.step = '1';
    rateInput.className = 'w-full bg-transparent text-light text-right focus:outline-none focus:ring-1 focus:ring-gold rounded px-1';
    rateInput.dataset.field = 'rate';
    rateInput.value = (item.rateCents / 100).toFixed(0);
    rateTd.appendChild(rateInput);

    // Amount cell
    const amountTd = document.createElement('td');
    amountTd.className = 'py-2 px-3 text-right text-light';
    amountTd.dataset.amount = item.amountCents.toString();
    amountTd.textContent = formatEur(item.amountCents);

    // Delete button cell
    const deleteTd = document.createElement('td');
    deleteTd.className = 'py-2 pl-2';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'text-red-400 hover:text-red-300 transition-colors';
    deleteBtn.setAttribute('aria-label', 'Position löschen');
    deleteBtn.textContent = '✕';
    deleteTd.appendChild(deleteBtn);

    tr.append(descTd, hoursTd, rateTd, amountTd, deleteTd);

    // Auto-save on change
    [descInput, hoursInput, rateInput].forEach(input => {
      input.addEventListener('change', async () => {
        const desc     = descInput.value;
        const hours    = parseFloat(hoursInput.value);
        const rateCents = Math.round(parseFloat(rateInput.value) * 100);
        const newAmountCents = Math.round(hours * rateCents);
        amountTd.dataset.amount = newAmountCents.toString();
        amountTd.textContent    = formatEur(newAmountCents);
        recalcTotal();
        await fetch(`/api/admin/billing/${currentInvoiceId}/item`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            invoiceItemId: item.invoiceItemId,
            description:   desc,
            hours,
            rateCents:     parseFloat(rateInput.value),
          }),
        });
      });
    });

    deleteBtn.addEventListener('click', async () => {
      await fetch(`/api/admin/billing/${currentInvoiceId}/item`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ invoiceItemId: item.invoiceItemId }),
      });
      tr.remove();
      recalcTotal();
    });

    return tr;
  }

  async function openDraftEditor(invoiceId: string): Promise<void> {
    currentInvoiceId = invoiceId;
    itemsBody.replaceChildren();
    const loadingRow = document.createElement('tr');
    const loadingTd  = document.createElement('td');
    loadingTd.colSpan = 5;
    loadingTd.className = 'py-4 text-muted text-center';
    loadingTd.textContent = 'Lade…';
    loadingRow.appendChild(loadingTd);
    itemsBody.appendChild(loadingRow);
    dialog.showModal();

    const res  = await fetch(`/api/admin/billing/${invoiceId}`);
    const data = await res.json() as { customerName: string; period: string; items: DraftItem[] };

    customerEl.textContent = `${data.customerName} — ${data.period}`;
    itemsBody.replaceChildren();
    data.items.forEach(item => itemsBody.appendChild(renderItem(item)));
    recalcTotal();
  }

  async function discardDraft(invoiceId: string): Promise<void> {
    if (!confirm('Entwurf wirklich verwerfen? Die Zeiteinträge werden wieder als nicht abgerechnet markiert.')) return;
    await fetch(`/api/admin/billing/${invoiceId}/discard`, { method: 'POST' });
    document.querySelector(`[data-invoice-id="${invoiceId}"]`)?.remove();
    updateBadge(-1);
  }

  function updateBadge(delta: number): void {
    const badge = document.getElementById('draft-badge');
    if (!badge) return;
    const count = Math.max(0, parseInt(badge.textContent ?? '0', 10) + delta);
    badge.textContent = count.toString();
    badge.classList.toggle('hidden', count === 0);
  }

  // Wire up list buttons
  document.getElementById('draft-list')?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const btn    = target.closest('button') as HTMLButtonElement | null;
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    if (btn.classList.contains('open-draft-btn'))    await openDraftEditor(id);
    if (btn.classList.contains('discard-draft-btn')) await discardDraft(id);
  });

  document.getElementById('add-item-btn')!.addEventListener('click', async () => {
    await fetch(`/api/admin/billing/${currentInvoiceId}/item`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ description: 'Neue Position', hours: 1, rateCents: 0 }),
    });
    if (currentInvoiceId) await openDraftEditor(currentInvoiceId);
  });

  document.getElementById('editor-send-btn')!.addEventListener('click', async () => {
    if (!currentInvoiceId) return;
    if (!confirm('Rechnung jetzt finalisieren und versenden?')) return;
    await fetch(`/api/admin/billing/${currentInvoiceId}/send`, { method: 'POST' });
    dialog.close();
    document.querySelector(`[data-invoice-id="${currentInvoiceId}"]`)?.remove();
    updateBadge(-1);
    currentInvoiceId = null;
  });

  document.getElementById('editor-discard-btn')!.addEventListener('click', async () => {
    if (!currentInvoiceId) return;
    await discardDraft(currentInvoiceId);
    dialog.close();
    currentInvoiceId = null;
  });
</script>
```

### Schritt 5.6 — Manuell testen

- [ ] Dev-Server starten: `task website:dev`
- [ ] Einen Draft manuell erzeugen:
  ```bash
  curl -X POST http://localhost:4321/api/admin/billing/create-monthly-invoices \
    -H "Content-Type: application/json" \
    -H "Cookie: <admin-session-cookie>" \
    -d '{"year":2026,"month":3}'
  ```
- [ ] Admin → Rechnungen: Draft-Sektion erscheint mit Badge
- [ ] "Bearbeiten" → Dialog öffnet, Felder editierbar, Betrag aktualisiert sich live
- [ ] Beschreibung oder Stunden ändern → PATCH wird gesendet (Network Tab prüfen)
- [ ] "Position hinzufügen" → neue Zeile erscheint
- [ ] "Verwerfen" im Dialog → Draft weg, Badge sinkt, in DB prüfen:
  ```bash
  task workspace:psql -- website
  SELECT id, stripe_invoice_id FROM time_entries ORDER BY created_at DESC LIMIT 5;
  ```
  Erwartung: `stripe_invoice_id` ist `NULL`

### Schritt 5.7 — Commit

```bash
git add website/src/pages/admin/rechnungen.astro
git commit -m "feat(admin): draft invoice review and editor UI"
```

---

## Task 6: Kubernetes CronJob für monatlichen Trigger

**Files:**
- Create: `k3d/cronjob-monthly-billing.yaml`
- Modify: `k3d/kustomization.yaml`
- Modify: `k3d/secrets.yaml`

### Schritt 6.1 — CronJob-Manifest erstellen

- [ ] Datei `k3d/cronjob-monthly-billing.yaml` erstellen:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: monthly-billing
  namespace: website
spec:
  schedule: "0 6 1 * *"   # 1. des Monats, 06:00 UTC
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: trigger
              image: curlimages/curl:8.7.1
              command:
                - sh
                - -c
                - |
                  curl -sf -X POST \
                    -H "Content-Type: application/json" \
                    -H "X-Cron-Secret: $(CRON_SECRET)" \
                    http://website.website.svc.cluster.local:4321/api/admin/billing/create-monthly-invoices
              env:
                - name: CRON_SECRET
                  valueFrom:
                    secretKeyRef:
                      name: website-secrets
                      key: CRON_SECRET
```

### Schritt 6.2 — CRON_SECRET zu dev-Secrets hinzufügen

- [ ] In `k3d/secrets.yaml` in der `stringData`-Sektion von `website-secrets` ergänzen:

```yaml
CRON_SECRET: dev-cron-secret-local
```

### Schritt 6.3 — CronJob in kustomization.yaml referenzieren

- [ ] In `k3d/kustomization.yaml` unter `resources:` ergänzen:

```yaml
- cronjob-monthly-billing.yaml
```

### Schritt 6.4 — Manifeste validieren

- [ ] Validation ausführen:

```bash
task workspace:validate
```

Erwartete Ausgabe: kein Fehler

### Schritt 6.5 — Commit

```bash
git add k3d/cronjob-monthly-billing.yaml k3d/kustomization.yaml k3d/secrets.yaml
git commit -m "feat(k8s): add monthly billing CronJob"
```

---

## Task 7: Pull Request erstellen

- [ ] Branch pushen:

```bash
git push -u origin HEAD
```

- [ ] PR öffnen mit Titel: `feat: monthly billable time invoicing via Stripe drafts`
- [ ] PR-Body (Kurzfassung):
  - Schema: `rate_cents` + `stripe_invoice_id` in `time_entries`
  - Zeiterfassungsformular: Stundensatz-Feld mit Vorbelegen
  - Stripe Draft Invoice Lifecycle: create, edit items, send, discard
  - Admin-UI: Badge + vollständiger Positions-Editor in `rechnungen.astro`
  - K8s CronJob: 1. des Monats, 06:00 UTC
- [ ] CI grün abwarten (`task workspace:validate` muss bestehen)

---

## Selbst-Review

**Spec-Coverage:**
- ✅ `rate_cents` beim Buchen → Task 1 + 2
- ✅ Vorbelegen des letzten Werts → Task 2.1
- ✅ Monatliche Aggregation per Kunde → Task 3.2
- ✅ Stripe Draft Invoices erstellen → Task 3.2
- ✅ Admin-Benachrichtigung (Badge) → Task 5.2/5.3
- ✅ Positionsbearbeitung vollständig im Panel → Task 5.4/5.5
- ✅ Versenden per Button → Task 5.5 + 3.9
- ✅ Verwerfen + time_entries freigeben → Task 5.5 + 3.10 + 4.8
- ✅ CronJob am Monatsersten → Task 6

**Type-Konsistenz:**
- `UnbilledCustomerGroup` definiert in Task 1.7, genutzt in Task 3.2 und 4.2 ✅
- `DraftInvoiceItem` / `DraftInvoiceDetail` definiert in Task 3.1, zurückgegeben von `getDraftInvoiceDetail` (3.5) und API-Endpoint (4.5) ✅
- `setTimeEntryStripeInvoice(ids, invoiceId)` definiert in Task 1.6, genutzt in 4.2 und 4.8 ✅
- `getUnbilledBillableEntriesByCustomer(year, month)` definiert in Task 1.7, genutzt in 4.2 ✅

**Security:**
- Alle User-Daten im Client-Script via `textContent`/`value` gesetzt — kein `innerHTML` mit dynamischen Daten ✅
- Alle Admin-Endpoints prüfen Session oder CRON_SECRET ✅
- `CRON_SECRET` kommt aus Kubernetes Secret, nicht aus dem Code ✅
