# Testdaten-Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Testdaten" tab to `/admin/monitoring` that lets Gekko generate `[TEST]`-prefixed seed records (clients, invoices, meetings, bookings) and purge them all in one click.

**Architecture:** Two new Astro API endpoints (`seed.ts`, `purge.ts`) call existing DB helpers and direct pool queries. A new `TestDataPanel.svelte` component renders two buttons with confirmation modal; it is wired into `MonitoringDashboard.svelte` as a new "Testdaten" tab.

**Tech Stack:** Astro API routes (TypeScript), Svelte 4, PostgreSQL via `pg` pool, existing `native-billing` + `messaging-db` + `website-db` helpers.

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `website/src/pages/api/admin/testdata/seed.ts` | POST: insert [TEST] records |
| Create | `website/src/pages/api/admin/testdata/purge.ts` | DELETE: remove all [TEST] records |
| Create | `website/src/components/admin/monitoring/TestDataPanel.svelte` | UI card with two buttons + confirmation modal |
| Modify | `website/src/components/admin/MonitoringDashboard.svelte` | Add "Testdaten" tab wired to TestDataPanel |

---

## Task 1: Seed API endpoint

**Files:**
- Create: `website/src/pages/api/admin/testdata/seed.ts`

### Implementation note on invoices

Only **draft** invoices are created (not finalized). `finalizeInvoice` sets `locked=true`, which the GoBD delete trigger blocks. Draft invoices (locked=false) can be purged cleanly. Three drafts at 500 / 1200 / 3400 € still exercise invoice creation and provide varied amounts for tax threshold testing.

- [ ] **Step 1: Create the seed endpoint**

```typescript
// website/src/pages/api/admin/testdata/seed.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';
import { createCustomer as createBillingCustomer, createInvoice } from '../../../../lib/native-billing';
import { createInboxItem } from '../../../../lib/messaging-db';

function jsonError(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return jsonError('Nicht autorisiert', 401);

  const brand = process.env.BRAND || 'mentolder';
  const today = new Date().toISOString().split('T')[0];

  try {
    // 1. CRM customers (customers table — no Keycloak)
    await pool.query(
      `INSERT INTO customers (name, email, phone, company)
       VALUES ($1,$2,$3,$4), ($5,$6,$7,$8)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name, company = EXCLUDED.company, updated_at = now()`,
      [
        '[TEST] Max Mustermann', 'test-max@test.invalid', '+49 111 0000001', '[TEST] Coaching AG',
        '[TEST] Erika Musterfrau', 'test-erika@test.invalid', '+49 111 0000002', '[TEST] Musterfirma GmbH',
      ]
    );
    const crmRes = await pool.query(
      `SELECT id FROM customers WHERE email IN ($1,$2)`,
      ['test-max@test.invalid', 'test-erika@test.invalid']
    );
    const [crmId1, crmId2] = crmRes.rows.map((r: { id: string }) => r.id);

    // 2. Billing customer
    const billingCustomer = await createBillingCustomer({
      brand,
      name: '[TEST] Test GmbH',
      email: 'test-billing@test.invalid',
      company: '[TEST] Test GmbH',
      addressLine1: 'Teststraße 1',
      city: 'Teststadt',
      postalCode: '12345',
    });

    // 3. Draft invoices (not finalized — keeps locked=false so purge can delete them)
    const invoiceAmounts = [
      { amount: 500,  desc: '[TEST] Coaching-Einzelstunde' },
      { amount: 1200, desc: '[TEST] Coaching-Paket 3 Sitzungen' },
      { amount: 3400, desc: '[TEST] Coaching-Intensivprogramm' },
    ];
    let invoiceCount = 0;
    for (const { amount, desc } of invoiceAmounts) {
      await createInvoice({
        brand,
        customerId: billingCustomer.id,
        issueDate: today,
        dueDays: 14,
        taxMode: 'kleinunternehmer',
        lines: [{ description: desc, quantity: 1, unitPrice: amount }],
        notes: '[TEST] Automatisch generierter Testdatensatz',
      });
      invoiceCount++;
    }

    // 4. Meetings (linked to CRM customers)
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const in3days  = new Date(Date.now() + 3 * 86_400_000).toISOString();
    if (crmId1 && crmId2) {
      await pool.query(
        `INSERT INTO meetings (customer_id, meeting_type, scheduled_at, status)
         VALUES ($1,$2,$3,$4), ($5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [
          crmId1, '[TEST] Erstgespräch',   tomorrow, 'scheduled',
          crmId2, '[TEST] Folgegespräch',  in3days,  'scheduled',
        ]
      );
    }

    // 5. Inbox bookings (Termine)
    await createInboxItem({
      type: 'booking',
      payload: {
        name: '[TEST] Max Mustermann', email: 'test-max@test.invalid',
        type: 'erstgespraech', typeLabel: '[TEST] Kostenloses Erstgespräch',
        slotStart: tomorrow, slotEnd: in3days, slotDisplay: '10:00–11:00',
        date: today, leistungKey: 'coaching', adminCreated: true,
      },
    });
    await createInboxItem({
      type: 'booking',
      payload: {
        name: '[TEST] Erika Musterfrau', email: 'test-erika@test.invalid',
        type: 'termin', typeLabel: '[TEST] Termin vor Ort',
        slotStart: in3days, slotEnd: in3days, slotDisplay: '14:00–15:00',
        date: today, leistungKey: 'coaching', adminCreated: true,
      },
    });

    return new Response(JSON.stringify({
      created: { customers: 2, billingCustomers: 1, invoices: invoiceCount, meetings: 2, bookings: 2 },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[testdata/seed]', err);
    return jsonError('Fehler beim Anlegen der Testdaten', 500);
  }
};
```

- [ ] **Step 2: Test seed manually**

```bash
# Port-forward to local (adjust ENV as needed — dev cluster for safety)
# Then in a new terminal:
curl -s -X POST http://localhost:4321/api/admin/testdata/seed \
  -H "Cookie: <paste an admin session cookie from browser>" | jq .
```

Expected output:
```json
{"created":{"customers":2,"billingCustomers":1,"invoices":3,"meetings":2,"bookings":2}}
```

Running it a second time should return the same counts (idempotent for customers/billing customer, new invoices/meetings/bookings are added each time — that's acceptable for test data).

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/testdata/seed.ts
git commit -m "feat(testdata): seed endpoint — [TEST] clients, invoices, meetings, bookings"
```

---

## Task 2: Purge API endpoint

**Files:**
- Create: `website/src/pages/api/admin/testdata/purge.ts`

The purge uses `pool` from `website-db` for all deletes (both `website-db` and `messaging-db` point to the same PostgreSQL instance via `SESSIONS_DATABASE_URL`, so cross-table deletes via one pool client work correctly).

- [ ] **Step 1: Create the purge endpoint**

```typescript
// website/src/pages/api/admin/testdata/purge.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';

function jsonError(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export const DELETE: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return jsonError('Nicht autorisiert', 401);

  try {
    // 1. Inbox bookings where payload.name starts with [TEST]
    const bookingRes = await pool.query(
      `DELETE FROM inbox_items WHERE payload->>'name' LIKE '[TEST]%' RETURNING id`
    );

    // 2. Meetings linked to [TEST] CRM customers
    const meetingRes = await pool.query(
      `DELETE FROM meetings
       WHERE customer_id IN (SELECT id FROM customers WHERE name LIKE '[TEST]%')
       RETURNING id`
    );

    // 3. Find unlocked [TEST] invoices (locked=false only — GoBD blocks locked ones)
    const lockedRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM billing_invoices i
       JOIN billing_customers c ON c.id = i.customer_id
       WHERE c.name LIKE '[TEST]%' AND i.locked = true`
    );
    const skippedLocked = parseInt(lockedRes.rows[0]?.cnt ?? '0', 10);

    // 4. Line items for unlocked [TEST] invoices
    const lineRes = await pool.query(
      `DELETE FROM billing_invoice_line_items
       WHERE invoice_id IN (
         SELECT i.id FROM billing_invoices i
         JOIN billing_customers c ON c.id = i.customer_id
         WHERE c.name LIKE '[TEST]%' AND i.locked = false
       )
       RETURNING id`
    );

    // 5. Unlocked [TEST] invoices
    const invoiceRes = await pool.query(
      `DELETE FROM billing_invoices i
       USING billing_customers c
       WHERE c.id = i.customer_id AND c.name LIKE '[TEST]%' AND i.locked = false
       RETURNING i.id`
    );

    // 6. [TEST] billing customers (after invoices are gone)
    const billingCustRes = await pool.query(
      `DELETE FROM billing_customers WHERE name LIKE '[TEST]%' RETURNING id`
    );

    // 7. [TEST] CRM customers
    const crmCustRes = await pool.query(
      `DELETE FROM customers WHERE name LIKE '[TEST]%' RETURNING id`
    );

    return new Response(JSON.stringify({
      deleted: {
        bookings:         bookingRes.rowCount ?? 0,
        meetings:         meetingRes.rowCount ?? 0,
        invoiceLines:     lineRes.rowCount ?? 0,
        invoices:         invoiceRes.rowCount ?? 0,
        billingCustomers: billingCustRes.rowCount ?? 0,
        customers:        crmCustRes.rowCount ?? 0,
      },
      skipped: { lockedInvoices: skippedLocked },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[testdata/purge]', err);
    return jsonError('Fehler beim Löschen der Testdaten', 500);
  }
};
```

- [ ] **Step 2: Test purge manually**

After running seed (Task 1 Step 2), run:

```bash
curl -s -X DELETE http://localhost:4321/api/admin/testdata/purge \
  -H "Cookie: <admin session cookie>" | jq .
```

Expected output (counts match what seed created):
```json
{
  "deleted": {"bookings":2,"meetings":2,"invoiceLines":3,"invoices":3,"billingCustomers":1,"customers":2},
  "skipped": {"lockedInvoices":0}
}
```

Running purge a second time should return all-zeros (idempotent).

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/testdata/purge.ts
git commit -m "feat(testdata): purge endpoint — delete all [TEST]-prefixed records"
```

---

## Task 3: TestDataPanel Svelte component

**Files:**
- Create: `website/src/components/admin/monitoring/TestDataPanel.svelte`

Style follows the same card/button pattern used in `BugsTab.svelte` and other monitoring tabs (gray-800 card background, blue primary button, red destructive button, spinner via `animate-spin`).

- [ ] **Step 1: Create the component**

```svelte
<!-- website/src/components/admin/monitoring/TestDataPanel.svelte -->
<script lang="ts">
  let seeding  = false;
  let purging  = false;
  let message: { text: string; kind: 'ok' | 'warn' | 'error' } | null = null;
  let confirmOpen = false;
  let msgTimer: ReturnType<typeof setTimeout>;

  function showMessage(text: string, kind: 'ok' | 'warn' | 'error') {
    message = { text, kind };
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { message = null; }, 5000);
  }

  async function seed() {
    seeding = true;
    message = null;
    try {
      const res = await fetch('/api/admin/testdata/seed', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || 'Fehler beim Generieren', 'error');
      } else {
        const c = data.created;
        showMessage(
          `Erstellt: ${c.customers} Clients, ${c.invoices} Rechnungen, ${c.meetings} Meetings, ${c.bookings} Buchungen`,
          'ok'
        );
      }
    } catch {
      showMessage('Netzwerkfehler', 'error');
    } finally {
      seeding = false;
    }
  }

  async function purge() {
    confirmOpen = false;
    purging = true;
    message = null;
    try {
      const res = await fetch('/api/admin/testdata/purge', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || 'Fehler beim Löschen', 'error');
      } else {
        const d = data.deleted;
        const skipped = data.skipped?.lockedInvoices ?? 0;
        const summary = `Gelöscht: ${d.customers} Clients, ${d.invoices} Rechnungen, ${d.meetings} Meetings, ${d.bookings} Buchungen`;
        showMessage(
          skipped > 0 ? `${summary} — ${skipped} gesperrte Rechnungen übersprungen` : summary,
          skipped > 0 ? 'warn' : 'ok'
        );
      }
    } catch {
      showMessage('Netzwerkfehler', 'error');
    } finally {
      purging = false;
    }
  }
</script>

<div class="bg-gray-800 rounded-lg p-5 space-y-4">
  <div>
    <h3 class="text-sm font-semibold text-gray-100">Testdaten</h3>
    <p class="text-xs text-gray-400 mt-1">
      Erzeugt <code class="text-gray-300">[TEST]</code>-Datensätze für Clients, Rechnungen, Meetings und Termine.
      Alle Testdaten können auf Knopfdruck vollständig entfernt werden.
    </p>
  </div>

  <div class="flex gap-3 flex-wrap">
    <button
      on:click={seed}
      disabled={seeding || purging}
      class="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500
             disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white"
    >
      {#if seeding}
        <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
      {/if}
      Testdaten generieren
    </button>

    <button
      on:click={() => { confirmOpen = true; }}
      disabled={seeding || purging}
      class="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-red-700 hover:bg-red-600
             disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white"
    >
      {#if purging}
        <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
      {/if}
      Alle [TEST]-Daten löschen
    </button>
  </div>

  {#if message}
    <p class="text-xs px-3 py-2 rounded {
      message.kind === 'ok'    ? 'bg-green-900 text-green-300' :
      message.kind === 'warn'  ? 'bg-yellow-900 text-yellow-300' :
                                 'bg-red-900 text-red-300'
    }">
      {message.text}
    </p>
  {/if}
</div>

<!-- Confirmation modal -->
{#if confirmOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true">
    <div class="bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4 space-y-4 shadow-xl">
      <h4 class="text-sm font-semibold text-gray-100">Testdaten löschen?</h4>
      <p class="text-xs text-gray-400">
        Alle Datensätze mit <code class="text-gray-300">[TEST]</code>-Präfix werden unwiderruflich gelöscht.
        Gesperrte Rechnungen werden übersprungen und als Warnung gemeldet.
      </p>
      <div class="flex gap-3 justify-end">
        <button
          on:click={() => { confirmOpen = false; }}
          class="px-4 py-2 rounded text-sm text-gray-300 hover:text-white transition-colors"
        >
          Abbrechen
        </button>
        <button
          on:click={purge}
          class="px-4 py-2 rounded text-sm font-medium bg-red-700 hover:bg-red-600 text-white transition-colors"
        >
          Löschen
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/monitoring/TestDataPanel.svelte
git commit -m "feat(testdata): TestDataPanel Svelte component — seed/purge buttons with confirmation"
```

---

## Task 4: Wire TestDataPanel into MonitoringDashboard

**Files:**
- Modify: `website/src/components/admin/MonitoringDashboard.svelte`

Add a new "Testdaten" tab using the same pattern as the existing tabs.

- [ ] **Step 1: Add the import and tab registration**

In `MonitoringDashboard.svelte`, add the import after the existing imports:

```typescript
// Add after line 9 (after import LogsTab):
import TestDataPanel from './monitoring/TestDataPanel.svelte';
```

Change the `Tab` type from:
```typescript
type Tab = 'overview' | 'cluster' | 'deployments' | 'argocd' | 'logs' | 'bugs' | 'tracking';
```
to:
```typescript
type Tab = 'overview' | 'cluster' | 'deployments' | 'argocd' | 'logs' | 'bugs' | 'tracking' | 'testdaten';
```

Change the `VALID_TABS` array from:
```typescript
const VALID_TABS: Tab[] = ['overview', 'cluster', 'deployments', 'argocd', 'logs', 'bugs', 'tracking'];
```
to:
```typescript
const VALID_TABS: Tab[] = ['overview', 'cluster', 'deployments', 'argocd', 'logs', 'bugs', 'tracking', 'testdaten'];
```

Add the tab label to the `tabs` array after the `tracking` entry:
```typescript
{ id: 'tracking',  label: 'Tracking' },
{ id: 'testdaten', label: 'Testdaten' },   // ← add this line
```

- [ ] **Step 2: Add the tab content panel**

In the `{#if activeTab === ...}` block, add after the tracking branch:

```svelte
{:else if activeTab === 'testdaten'}
  <TestDataPanel />
```

- [ ] **Step 3: Verify in browser**

Start the dev server:
```bash
cd website && npm run dev
```

Navigate to `http://localhost:4321/admin/monitoring` (admin session required).

Check:
1. A "Testdaten" tab appears in the tab bar
2. Clicking it shows the panel with two buttons
3. "Testdaten generieren" spins, then shows a success message
4. "Alle [TEST]-Daten löschen" opens the confirmation modal
5. Confirming deletion shows deleted counts in the success message
6. Verify in `/admin/clients` that `[TEST] Max Mustermann` and `[TEST] Erika Musterfrau` appear after seed and disappear after purge
7. Verify in `/admin/rechnungen` that 3 `[TEST]`-noted draft invoices appear/disappear

- [ ] **Step 4: Commit**

```bash
git add website/src/components/admin/MonitoringDashboard.svelte
git commit -m "feat(testdata): wire TestDataPanel as Testdaten tab in monitoring dashboard"
```

---

## Task 5: Deploy

- [ ] **Step 1: Deploy to mentolder**

```bash
task website:deploy ENV=mentolder
```

Wait for rollout to complete, then open `https://web.mentolder.de/admin/monitoring#testdaten` and verify the tab and both buttons work against the live database.

- [ ] **Step 2: Deploy to korczewski**

```bash
task website:deploy ENV=korczewski
```

- [ ] **Step 3: Final smoke test**

On `https://web.mentolder.de/admin/monitoring#testdaten`:
1. Click "Testdaten generieren" — confirm success message with counts
2. Check `/admin/clients` for `[TEST]` clients
3. Check `/admin/rechnungen` for `[TEST]` invoices
4. Click "Alle [TEST]-Daten löschen" → confirm → verify all counts returned are non-zero and records disappear from the list pages

- [ ] **Step 4: Commit tracking entry**

```bash
# No additional commit needed if all changes are already committed above.
# Run the tracking PR workflow if required by project convention.
```
