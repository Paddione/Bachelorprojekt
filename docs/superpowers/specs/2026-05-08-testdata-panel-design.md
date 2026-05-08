# Testdaten-Panel — Design Spec

**Date:** 2026-05-08
**Status:** Approved

## Problem

Gekko (admin of mentolder.de) needs a way to quickly generate realistic test records before running system tests (clients, invoices, appointments, meetings), and to wipe them cleanly afterwards. Currently he has to create them manually through the admin UI and delete them one by one.

## Scope

Generate and purge `[TEST]`-prefixed records for:
- CRM clients (`customers` table)
- Billing customers + invoices (`billing_customers`, `billing_invoices`, `billing_invoice_line_items`)
- Meetings (`meetings` table)
- Bookings/Termine (inbox items in `messaging-db`)

Entry point: existing `/admin/monitoring` page (new compact card at the bottom of the page).

Out of scope: questionnaire assignments, projects, documents, Keycloak user creation.

## Architecture

### New files

```
website/src/pages/api/admin/testdata/
  seed.ts     ← POST — inserts [TEST] records
  purge.ts    ← DELETE — removes all [TEST] records

website/src/components/admin/monitoring/
  TestDataPanel.svelte   ← compact card with two buttons + status display
```

### Modified files

```
website/src/components/admin/MonitoringDashboard.svelte
  ← import and render TestDataPanel
```

## Seed endpoint — `POST /api/admin/testdata/seed`

Auth: admin session required (401 otherwise).

Inserts directly into DB — no Keycloak calls, no emails sent.

**Records created:**

| Table | Records | Key fields |
|---|---|---|
| `customers` | 2 | name `[TEST] Max Mustermann` / `[TEST] Erika Musterfrau`, fake emails `test-max@test.invalid` / `test-erika@test.invalid` |
| `billing_customers` | 1 | name `[TEST] Test GmbH`, email `test-billing@test.invalid`, brand from env |
| `billing_invoices` | 3 | statuses: draft / open / paid; amounts: 500 / 1200 / 3400 €; notes prefixed `[TEST]`; linked to the billing customer |
| `billing_invoice_line_items` | 3 | one line per invoice (coaching session description) |
| `meetings` | 2 | `meeting_type = '[TEST] Erstgespräch'` / `'[TEST] Folgegespräch'`; `status = 'scheduled'`; linked to test customers; `scheduled_at` = now+1d / now+3d |
| inbox items | 2 | `type = 'booking'`, `payload.name = '[TEST] ...'`; `adminCreated: true`; no email sent |

Customers use `ON CONFLICT (email) DO UPDATE` so running seed twice is safe — existing records are updated, not duplicated.

Invoice number generation uses the existing `createInvoice` helper from `lib/native-billing` to ensure correct numbering sequence.

**Response:**
```json
{ "created": { "customers": 2, "billingCustomers": 1, "invoices": 3, "meetings": 2, "bookings": 2 } }
```

## Purge endpoint — `DELETE /api/admin/testdata/purge`

Auth: admin session required (401 otherwise).

Deletes in FK-safe order:

1. Inbox items where `payload->>'name' LIKE '[TEST]%'`
2. Meetings where `customer_id IN (SELECT id FROM customers WHERE name LIKE '[TEST]%')`
3. `billing_invoice_line_items` for invoices where `customer_id IN ([TEST] billing_customers)` AND `locked = false`
4. `billing_invoices` where `customer_id IN ([TEST] billing_customers)` AND `locked = false`
5. `billing_customers` where `name LIKE '[TEST]%'`
6. `customers` where `name LIKE '[TEST]%'`

Locked invoices are skipped (GoBD trigger blocks them anyway). The response reports skipped locked invoices as a warning, not a failure.

**Response:**
```json
{
  "deleted": { "bookings": 2, "meetings": 2, "invoiceLines": 3, "invoices": 3, "billingCustomers": 1, "customers": 2 },
  "skipped": { "lockedInvoices": 0 }
}
```

## UI — `TestDataPanel.svelte`

Compact card styled consistently with other monitoring cards (e.g. `BugsTab.svelte` button patterns).

```
┌─────────────────────────────────────────────────┐
│ Testdaten                                        │
│ Erzeugt [TEST]-Datensätze für Clients,           │
│ Rechnungen und Termine. Löscht alle [TEST]-Daten │
│ auf Knopfdruck.                                  │
│                                                  │
│ [Testdaten generieren]  [Alle [TEST]-Daten ...]  │
│                                                  │
│ ✓ 2 Clients, 3 Rechnungen, 2 Meetings erstellt   │
└─────────────────────────────────────────────────┘
```

- Both buttons show a spinner while request is in flight
- Success/error message appears below buttons, auto-clears after 5 seconds
- "Alle [TEST]-Daten löschen" opens a confirmation modal before calling purge:
  > "Alle Datensätze mit [TEST]-Präfix werden unwiderruflich gelöscht. Fortfahren?"

## Error handling

- Seed: if any step fails, error is returned with which step failed; completed steps are not rolled back (partial seed is better than no seed for test purposes)
- Purge: each delete step runs independently; first failure returns error with partial count
- Locked invoice skip: reported in response `skipped.lockedInvoices`, shown as yellow warning in UI (not a red error)

## Security

- Both endpoints check `isAdmin(session)` — same pattern as all other admin API routes
- `.invalid` TLD on test emails ensures no accidental email delivery if something bypasses the seed path
- `[TEST]` prefix is the only deletion filter — purge cannot touch records without it
