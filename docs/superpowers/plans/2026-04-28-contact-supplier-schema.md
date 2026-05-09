---
title: Plan G — Contact/Supplier Schema Rework
domains: [db]
status: completed
pr_number: null
---

# Plan G — Contact/Supplier Schema Rework

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `land_iso`-driven tax logic to `billing_customers`, introduce a separate `billing_suppliers` table with human-readable `L-XXXX` IDs, and add a full `supplier_invoices` ledger with automatic EÜR booking on status transition to `booked`.

**Architecture:** Two sequential PRs. PR-G1 migrates `billing_customers.country → land_iso`, adds `billing-tax.ts` pure helpers, and wires reverse-charge auto-detection into invoice finalization. PR-G2 adds `billing_suppliers`, `supplier_invoices`, extends `eur_bookings`, and surfaces supplier management in the admin UI.

**Tech Stack:** TypeScript, Astro, Svelte, PostgreSQL (website-db), Vitest, existing `website-db.ts` init pattern, existing `eur-bookkeeping.ts` `addBooking` function.

**Spec:** `docs/superpowers/specs/2026-04-28-contact-supplier-schema-design.md`

---

## File Map

### PR-G1

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `website/src/lib/billing-tax.ts` | EU set, `resolveCustomerTaxCategory`, `isVorsteuerEligible` |
| Create | `website/src/lib/billing-tax.test.ts` | Unit tests for both helpers |
| Modify | `website/src/lib/website-db.ts` | DB migration: rename `country→land_iso`, add `typ`, new unique constraint |
| Modify | `website/src/lib/native-billing.ts` | `Customer.country → landIso`, `mapCustomer`, `createCustomer` conflict target |
| Modify | `website/src/pages/api/admin/billing/[id]/send.ts` | `customer.country → .landIso`, call `resolveCustomerTaxCategory` |
| Modify | `website/src/components/admin/CreateInvoiceModal.svelte` | Reverse-charge hint badge |

### PR-G2

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `website/src/lib/website-db.ts` | `initSupplierTables`: `billing_suppliers` + trigger + `supplier_invoices` + `eur_bookings` extension |
| Create | `website/src/lib/supplier-billing.ts` | `Supplier` + `SupplierInvoice` interfaces, full CRUD, `bookSupplierInvoice` |
| Create | `website/src/lib/supplier-billing.test.ts` | Integration tests |
| Modify | `website/src/lib/eur-bookkeeping.ts` | Add `supplierInvoiceId` to `EurBooking`, update `addBooking` |
| Create | `website/src/pages/api/admin/billing/suppliers/index.ts` | GET list / POST create supplier |
| Create | `website/src/pages/api/admin/billing/suppliers/[id].ts` | GET / PUT / DELETE supplier |
| Create | `website/src/pages/api/admin/billing/supplier-invoices/index.ts` | GET list / POST create |
| Create | `website/src/pages/api/admin/billing/supplier-invoices/[id].ts` | GET / PUT (status transitions) |
| Create | `website/src/pages/admin/lieferanten.astro` | Lieferanten list page |
| Create | `website/src/pages/admin/lieferanten/[id].astro` | Supplier detail + invoice list |
| Create | `website/src/components/admin/SupplierInvoiceForm.svelte` | Create supplier invoice form |

---

## PR-G1

---

### Task 1: `billing-tax.ts` — pure tax helpers

**Files:**
- Create: `website/src/lib/billing-tax.ts`
- Create: `website/src/lib/billing-tax.test.ts`

- [ ] **Step 1: Create `billing-tax.ts`**

```typescript
// website/src/lib/billing-tax.ts
const EU_COUNTRIES = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI',
  'FR','GR','HR','HU','IE','IT','LT','LU','LV','MT',
  'NL','PL','PT','RO','SE','SI','SK',
]);

export function resolveCustomerTaxCategory(
  landIso: string,
  vatNumber: string | undefined,
): 'S' | 'AE' | 'Z' {
  if (landIso === 'DE') return 'S';
  if (EU_COUNTRIES.has(landIso)) return vatNumber ? 'AE' : 'S';
  return 'Z';
}

export function isVorsteuerEligible(landIso: string): boolean {
  return EU_COUNTRIES.has(landIso);
}
```

- [ ] **Step 2: Write failing tests**

```typescript
// website/src/lib/billing-tax.test.ts
import { it, expect } from 'vitest';
import { resolveCustomerTaxCategory, isVorsteuerEligible } from './billing-tax';

it('DE → S regardless of vatNumber', () => {
  expect(resolveCustomerTaxCategory('DE', undefined)).toBe('S');
  expect(resolveCustomerTaxCategory('DE', 'DE123456789')).toBe('S');
});

it('EU + vatNumber → AE (reverse charge §13b UStG)', () => {
  expect(resolveCustomerTaxCategory('FR', 'FR12345678901')).toBe('AE');
  expect(resolveCustomerTaxCategory('AT', 'ATU12345678')).toBe('AE');
});

it('EU + no vatNumber → S (private EU customer)', () => {
  expect(resolveCustomerTaxCategory('FR', undefined)).toBe('S');
  expect(resolveCustomerTaxCategory('IT', '')).toBe('S');
});

it('non-EU → Z (zero-rated export)', () => {
  expect(resolveCustomerTaxCategory('US', 'US123456789')).toBe('Z');
  expect(resolveCustomerTaxCategory('CH', undefined)).toBe('Z');
  expect(resolveCustomerTaxCategory('CN', undefined)).toBe('Z');
});

it('isVorsteuerEligible: DE and EU → true', () => {
  expect(isVorsteuerEligible('DE')).toBe(true);
  expect(isVorsteuerEligible('FR')).toBe(true);
  expect(isVorsteuerEligible('PL')).toBe(true);
  expect(isVorsteuerEligible('SK')).toBe(true);
});

it('isVorsteuerEligible: non-EU → false', () => {
  expect(isVorsteuerEligible('US')).toBe(false);
  expect(isVorsteuerEligible('CH')).toBe(false);
  expect(isVorsteuerEligible('CN')).toBe(false);
  expect(isVorsteuerEligible('GB')).toBe(false);
});
```

- [ ] **Step 3: Run tests — expect FAIL (module not found)**

```bash
cd website && npx vitest run src/lib/billing-tax.test.ts
```
Expected: FAIL — "Cannot find module './billing-tax'"

- [ ] **Step 4: Run tests — expect PASS (file now exists)**

```bash
cd website && npx vitest run src/lib/billing-tax.test.ts
```
Expected: 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/billing-tax.ts website/src/lib/billing-tax.test.ts
git commit -m "feat(billing): billing-tax.ts — resolveCustomerTaxCategory + isVorsteuerEligible"
```

---

### Task 2: DB migration — `billing_customers` land_iso + typ + new unique constraint

**Files:**
- Modify: `website/src/lib/website-db.ts` (around line 3103 — `initBillingTables`)

- [ ] **Step 1: In `website-db.ts`, find the `CREATE TABLE IF NOT EXISTS billing_customers` block (line ~3103) and change `country TEXT NOT NULL DEFAULT 'DE'` to `land_iso CHAR(2) NOT NULL DEFAULT 'DE'`**

Old:
```sql
      country       TEXT NOT NULL DEFAULT 'DE',
```
New:
```sql
      land_iso      CHAR(2) NOT NULL DEFAULT 'DE',
```

- [ ] **Step 2: After the closing `` ` `` of the `CREATE TABLE billing_customers` block, add the migration ALTER TABLE statements**

Find the line:
```typescript
  await pool.query(`ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS default_leitweg_id TEXT`);
```

Replace it with:
```typescript
  await pool.query(`ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS default_leitweg_id TEXT`);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='billing_customers' AND column_name='country'
      ) THEN
        ALTER TABLE billing_customers RENAME COLUMN country TO land_iso;
      END IF;
    END $$
  `);
  await pool.query(`
    ALTER TABLE billing_customers
      ADD COLUMN IF NOT EXISTS typ TEXT NOT NULL DEFAULT 'Kunde'
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='billing_customers_typ_chk'
      ) THEN
        ALTER TABLE billing_customers
          ADD CONSTRAINT billing_customers_typ_chk CHECK (typ IN ('Kunde'));
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='billing_customers_brand_email_key'
      ) THEN
        ALTER TABLE billing_customers DROP CONSTRAINT billing_customers_brand_email_key;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='billing_customers_brand_email_typ_key'
      ) THEN
        ALTER TABLE billing_customers
          ADD CONSTRAINT billing_customers_brand_email_typ_key UNIQUE (brand, email, typ);
      END IF;
    END $$
  `);
```

- [ ] **Step 3: Validate manifests compile (no cluster needed)**

```bash
cd website && npx tsc --noEmit
```
Expected: 0 errors (the `country` column is gone from CREATE TABLE, but `mapCustomer` still reads `row.country` — this won't fail at compile time since it's a runtime `Record<string, unknown>` access; Task 3 fixes it)

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(billing): migrate billing_customers country→land_iso, add typ column"
```

---

### Task 3: `native-billing.ts` — rename `country` → `landIso`

**Files:**
- Modify: `website/src/lib/native-billing.ts`

- [ ] **Step 1: In `native-billing.ts`, update the `Customer` interface (line ~8–15)**

Old:
```typescript
export interface Customer {
  id: string; brand: string; name: string; email: string;
  company?: string; addressLine1?: string; city?: string;
  postalCode?: string; country: string; vatNumber?: string;
  sepaIban?: string; sepaBic?: string;
  sepaMandateRef?: string; sepaMandateDate?: string;
  defaultLeitwegId?: string;
}
```

New:
```typescript
export interface Customer {
  id: string; brand: string; name: string; email: string;
  company?: string; addressLine1?: string; city?: string;
  postalCode?: string; landIso: string; vatNumber?: string;
  sepaIban?: string; sepaBic?: string;
  sepaMandateRef?: string; sepaMandateDate?: string;
  defaultLeitwegId?: string;
}
```

- [ ] **Step 2: Update `createCustomer` — fix ON CONFLICT target (the unique constraint now includes `typ`)**

Find the `ON CONFLICT (brand, email) DO UPDATE` line inside `createCustomer` and replace the entire INSERT query:

Old:
```typescript
    `INSERT INTO billing_customers (brand, name, email, company, address_line1, city, postal_code, vat_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (brand, email) DO UPDATE
       SET name=EXCLUDED.name, company=EXCLUDED.company,
           address_line1=EXCLUDED.address_line1, city=EXCLUDED.city,
           postal_code=EXCLUDED.postal_code, vat_number=EXCLUDED.vat_number
     RETURNING *`,
```

New:
```typescript
    `INSERT INTO billing_customers (brand, name, email, company, address_line1, city, postal_code, vat_number, typ)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Kunde')
     ON CONFLICT (brand, email, typ) DO UPDATE
       SET name=EXCLUDED.name, company=EXCLUDED.company,
           address_line1=EXCLUDED.address_line1, city=EXCLUDED.city,
           postal_code=EXCLUDED.postal_code, vat_number=EXCLUDED.vat_number
     RETURNING *`,
```

- [ ] **Step 3: Update `mapCustomer` (line ~332)**

Old:
```typescript
    country: (row.country as string) ?? 'DE',
```

New:
```typescript
    landIso: (row.land_iso as string) ?? 'DE',
```

- [ ] **Step 4: Run `tsc --noEmit` to surface all `customer.country` callsites that now break**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "country"
```
Expected: errors listing callsites that still reference `.country`

- [ ] **Step 5: Fix remaining callsite in `send.ts` (line ~147)**

File: `website/src/pages/api/admin/billing/[id]/send.ts`

Old:
```typescript
      country: customer.country || 'DE',
```

New:
```typescript
      country: customer.landIso || 'DE',
```

- [ ] **Step 6: Fix remaining callsite in `send.ts` (line ~79) — seller block uses its own `seller.country`, not customer; verify it is NOT `customer.country`**

```bash
grep -n "\.country" website/src/pages/api/admin/billing/[id]/send.ts
```
Expected: only the one line at ~147 references `customer.country`. All other `.country` references are on `seller` (different object). If any additional `customer.country` lines appear, fix them the same way.

- [ ] **Step 7: Verify compilation is clean**

```bash
cd website && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 8: Run existing billing tests**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
```
Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add website/src/lib/native-billing.ts website/src/pages/api/admin/billing/[id]/send.ts
git commit -m "feat(billing): rename Customer.country → landIso, fix ON CONFLICT target"
```

---

### Task 4: Wire `resolveCustomerTaxCategory` into invoice finalization

**Files:**
- Modify: `website/src/pages/api/admin/billing/[id]/send.ts`

- [ ] **Step 1: Add import at the top of `send.ts`**

Find the existing imports block and add:
```typescript
import { resolveCustomerTaxCategory } from '../../../../lib/billing-tax';
```

- [ ] **Step 2: Replace the hardcoded `'S'` taxCategory in the `lines.map` call (line ~124)**

Old:
```typescript
      taxCategory: (tempInvoice.taxMode === 'kleinunternehmer' ? 'E' : 'S') as 'E' | 'S',
```

New:
```typescript
      taxCategory: (tempInvoice.taxMode === 'kleinunternehmer'
        ? 'E'
        : resolveCustomerTaxCategory(customer.landIso, customer.vatNumber)) as 'E' | 'AE' | 'Z',
```

- [ ] **Step 3: Verify compilation**

```bash
cd website && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/admin/billing/[id]/send.ts
git commit -m "feat(billing): auto-resolve taxCategory from customer land_iso (reverse-charge)"
```

---

### Task 5: `CreateInvoiceModal.svelte` — reverse-charge hint badge

**Files:**
- Modify: `website/src/components/admin/CreateInvoiceModal.svelte`

- [ ] **Step 1: Add EU_COUNTRIES constant and reactive `suggestedTaxCategory` to the `<script>` block**

In the `<script>` section, find where customer-related reactive variables are declared and add:

```typescript
const EU_COUNTRIES = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI',
  'FR','GR','HR','HU','IE','IT','LT','LU','LV','MT',
  'NL','PL','PT','RO','SE','SI','SK',
]);

$: taxHint = (() => {
  if (!selectedCustomer || selectedCustomer.landIso === 'DE') return null;
  if (EU_COUNTRIES.has(selectedCustomer.landIso) && selectedCustomer.vatNumber)
    return 'EU-Geschäftskunde mit USt-IdNr → Reverse Charge (§13b UStG)';
  if (!EU_COUNTRIES.has(selectedCustomer.landIso))
    return 'Nicht-EU-Kunde → Steuerfreie Ausfuhrlieferung (§4 Nr.1a UStG)';
  return null;
})();
```

> Note: `selectedCustomer` is whichever variable holds the currently selected customer object in this component. Read the top of the `<script>` block to find its name and adjust if different.

- [ ] **Step 2: Add the hint badge in the template, near the customer picker**

Find the block in the template that renders the customer selector and add immediately below it:

```svelte
{#if taxHint}
  <p class="text-xs text-amber-600 mt-1">⚡ {taxHint}</p>
{/if}
```

- [ ] **Step 3: Verify compilation**

```bash
cd website && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Commit — PR-G1 complete**

```bash
git add website/src/components/admin/CreateInvoiceModal.svelte
git commit -m "feat(billing): show reverse-charge hint badge in CreateInvoiceModal"
```

---

## PR-G2

---

### Task 6: DB schema — `initSupplierTables` in `website-db.ts`

**Files:**
- Modify: `website/src/lib/website-db.ts` (after `initEurTables`)

- [ ] **Step 1: Add `supplierTablesReady` flag and `initSupplierTables` function at the bottom of `website-db.ts`**

```typescript
let supplierTablesReady = false;
export async function initSupplierTables(): Promise<void> {
  if (supplierTablesReady) return;

  await pool.query(`CREATE SEQUENCE IF NOT EXISTS supplier_seq`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_suppliers (
      id            TEXT PRIMARY KEY,
      brand         TEXT NOT NULL,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL,
      company       TEXT,
      address_line1 TEXT,
      city          TEXT,
      postal_code   TEXT,
      land_iso      CHAR(2) NOT NULL DEFAULT 'DE',
      vat_number    TEXT,
      steuernummer  TEXT,
      sepa_iban     TEXT,
      sepa_bic      TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (brand, email)
    )
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION billing_suppliers_gen_id()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      NEW.id := 'L-' || LPAD(nextval('supplier_seq')::text, 4, '0');
      RETURN NEW;
    END $$
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname='billing_suppliers_id_trigger'
      ) THEN
        CREATE TRIGGER billing_suppliers_id_trigger
          BEFORE INSERT ON billing_suppliers
          FOR EACH ROW WHEN (NEW.id IS NULL OR NEW.id = '')
          EXECUTE FUNCTION billing_suppliers_gen_id();
      END IF;
    END $$
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplier_invoices (
      id                 BIGSERIAL PRIMARY KEY,
      brand              TEXT NOT NULL,
      supplier_id        TEXT NOT NULL REFERENCES billing_suppliers(id),
      invoice_number     TEXT NOT NULL,
      invoice_date       DATE NOT NULL,
      due_date           DATE,
      net_amount         NUMERIC(12,2) NOT NULL,
      vat_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
      gross_amount       NUMERIC(12,2) NOT NULL,
      category           TEXT NOT NULL,
      description        TEXT NOT NULL,
      status             TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN ('received','booked','paid')),
      payment_method     TEXT,
      paid_at            DATE,
      receipt_path       TEXT,
      vorsteuer_eligible BOOLEAN NOT NULL,
      eur_booking_id     BIGINT,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (brand, supplier_id, invoice_number)
    )
  `);

  // extend eur_bookings: supplier_invoice_id column + FK + mutual-exclusivity check
  await pool.query(`
    ALTER TABLE eur_bookings
      ADD COLUMN IF NOT EXISTS supplier_invoice_id BIGINT
        REFERENCES supplier_invoices(id)
  `);

  // add FK back from supplier_invoices to eur_bookings (deferred to avoid circular)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='supplier_invoices_eur_booking_fk'
      ) THEN
        ALTER TABLE supplier_invoices
          ADD CONSTRAINT supplier_invoices_eur_booking_fk
          FOREIGN KEY (eur_booking_id) REFERENCES eur_bookings(id);
      END IF;
    END $$
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='eur_bookings_source_chk'
      ) THEN
        ALTER TABLE eur_bookings
          ADD CONSTRAINT eur_bookings_source_chk
          CHECK (NOT (invoice_id IS NOT NULL AND supplier_invoice_id IS NOT NULL));
      END IF;
    END $$
  `);

  supplierTablesReady = true;
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd website && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(billing): initSupplierTables — billing_suppliers, supplier_invoices, eur_bookings extension"
```

---

### Task 7: `eur-bookkeeping.ts` — add `supplierInvoiceId` support

**Files:**
- Modify: `website/src/lib/eur-bookkeeping.ts`

- [ ] **Step 1: Add `supplierInvoiceId` to the `EurBooking` interface**

Old:
```typescript
export interface EurBooking {
  id: number; brand: string; bookingDate: string; type: string;
  category: string; description: string; netAmount: number;
  vatAmount: number; invoiceId?: string; receiptPath?: string;
  belegnummer?: string; skrKonto?: string;
}
```

New:
```typescript
export interface EurBooking {
  id: number; brand: string; bookingDate: string; type: string;
  category: string; description: string; netAmount: number;
  vatAmount: number; invoiceId?: string; supplierInvoiceId?: number;
  receiptPath?: string; belegnummer?: string; skrKonto?: string;
}
```

- [ ] **Step 2: Update `addBooking` parameter type to accept `supplierInvoiceId`**

Old:
```typescript
export async function addBooking(
  p: Omit<EurBooking, 'id' | 'belegnummer' | 'skrKonto'> & {
    belegnummer?: string;
    skrKonto?: string;
    taxMode?: string;
  }
): Promise<EurBooking> {
```

New:
```typescript
export async function addBooking(
  p: Omit<EurBooking, 'id' | 'belegnummer' | 'skrKonto'> & {
    belegnummer?: string;
    skrKonto?: string;
    taxMode?: string;
  }
): Promise<EurBooking> {
```
(No change to signature — `supplierInvoiceId` is already in `EurBooking` which is the `Omit` base)

- [ ] **Step 3: Update the INSERT query in `addBooking` to include `supplier_invoice_id`**

Old:
```typescript
  const r = await pool.query(
    `INSERT INTO eur_bookings
       (brand,booking_date,type,category,description,net_amount,vat_amount,invoice_id,receipt_path,belegnummer,skr_konto)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [p.brand, p.bookingDate, p.type, p.category, p.description,
     p.netAmount, p.vatAmount, p.invoiceId ?? null, p.receiptPath ?? null,
     beleg, skr]
  );
```

New:
```typescript
  const r = await pool.query(
    `INSERT INTO eur_bookings
       (brand,booking_date,type,category,description,net_amount,vat_amount,
        invoice_id,supplier_invoice_id,receipt_path,belegnummer,skr_konto)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [p.brand, p.bookingDate, p.type, p.category, p.description,
     p.netAmount, p.vatAmount, p.invoiceId ?? null, p.supplierInvoiceId ?? null,
     p.receiptPath ?? null, beleg, skr]
  );
```

- [ ] **Step 4: Update `mapBooking` to include `supplierInvoiceId`**

Old `mapBooking` return:
```typescript
    invoiceId: (row.invoice_id as string) ?? undefined,
    receiptPath: (row.receipt_path as string) ?? undefined,
```

New:
```typescript
    invoiceId: (row.invoice_id as string) ?? undefined,
    supplierInvoiceId: row.supplier_invoice_id != null ? Number(row.supplier_invoice_id) : undefined,
    receiptPath: (row.receipt_path as string) ?? undefined,
```

- [ ] **Step 5: Run existing EÜR tests**

```bash
cd website && npx vitest run src/lib/eur-bookkeeping.test.ts
```
Expected: all tests pass (new column is nullable; existing tests pass `invoiceId` only)

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/eur-bookkeeping.ts
git commit -m "feat(billing): eur-bookkeeping supports supplierInvoiceId linkage"
```

---

### Task 8: `supplier-billing.ts` — Supplier CRUD + SupplierInvoice CRUD + `bookSupplierInvoice`

**Files:**
- Create: `website/src/lib/supplier-billing.ts`
- Create: `website/src/lib/supplier-billing.test.ts`

- [ ] **Step 1: Write the failing integration tests first**

```typescript
// website/src/lib/supplier-billing.test.ts
import { it, expect, beforeAll } from 'vitest';
import { pool } from './website-db';
import {
  createSupplier, getSupplierById, listSuppliers,
  createSupplierInvoice, bookSupplierInvoice, paySupplierInvoice,
  getSupplierInvoiceById,
} from './supplier-billing';

beforeAll(async () => {
  const { initSupplierTables, initEurTables } = await import('./website-db');
  await initEurTables();
  await initSupplierTables();
});

it('creates supplier with L-XXXX id', async () => {
  const s = await createSupplier({
    brand: 'test', name: 'ACME GmbH', email: `acme-${Date.now()}@test.de`,
    landIso: 'DE',
  });
  expect(s.id).toMatch(/^L-\d{4}$/);
  expect(s.landIso).toBe('DE');
});

it('getSupplierById returns created supplier', async () => {
  const s = await createSupplier({
    brand: 'test', name: 'Beta AG', email: `beta-${Date.now()}@test.de`,
    landIso: 'FR', vatNumber: 'FR12345678901', steuernummer: undefined,
  });
  const found = await getSupplierById('test', s.id);
  expect(found?.name).toBe('Beta AG');
  expect(found?.landIso).toBe('FR');
});

it('sequential suppliers get increasing L-XXXX ids', async () => {
  const a = await createSupplier({ brand: 'test', name: 'A', email: `seq-a-${Date.now()}@t.de`, landIso: 'DE' });
  const b = await createSupplier({ brand: 'test', name: 'B', email: `seq-b-${Date.now()}@t.de`, landIso: 'DE' });
  const numA = parseInt(a.id.slice(2));
  const numB = parseInt(b.id.slice(2));
  expect(numB).toBeGreaterThan(numA);
});

it('DE supplier invoice: vorsteuer_eligible=true, EÜR booking on booked', async () => {
  const s = await createSupplier({ brand: 'test', name: 'DE Lieferant', email: `de-${Date.now()}@t.de`, landIso: 'DE' });
  const inv = await createSupplierInvoice({
    brand: 'test', supplierId: s.id,
    invoiceNumber: `INV-${Date.now()}`, invoiceDate: '2026-04-01',
    netAmount: 100, vatAmount: 19, grossAmount: 119,
    category: 'software', description: 'Lizenz',
  });
  expect(inv.vorsteuerEligible).toBe(true);
  expect(inv.status).toBe('received');

  const booked = await bookSupplierInvoice(inv.id, 'test');
  expect(booked.status).toBe('booked');
  expect(booked.eurBookingId).toBeTruthy();

  const eurRow = await pool.query(`SELECT vat_amount, supplier_invoice_id FROM eur_bookings WHERE id=$1`, [booked.eurBookingId]);
  expect(Number(eurRow.rows[0].vat_amount)).toBe(19);
  expect(Number(eurRow.rows[0].supplier_invoice_id)).toBe(inv.id);
});

it('non-EU supplier invoice: vorsteuer_eligible=false, EÜR booking vat=0', async () => {
  const s = await createSupplier({ brand: 'test', name: 'US Corp', email: `us-${Date.now()}@t.de`, landIso: 'US' });
  const inv = await createSupplierInvoice({
    brand: 'test', supplierId: s.id,
    invoiceNumber: `INV-${Date.now()}`, invoiceDate: '2026-04-01',
    netAmount: 200, vatAmount: 0, grossAmount: 200,
    category: 'software', description: 'SaaS',
  });
  expect(inv.vorsteuerEligible).toBe(false);

  const booked = await bookSupplierInvoice(inv.id, 'test');
  const eurRow = await pool.query(`SELECT vat_amount FROM eur_bookings WHERE id=$1`, [booked.eurBookingId]);
  expect(Number(eurRow.rows[0].vat_amount)).toBe(0);
});

it('duplicate invoice number rejected', async () => {
  const s = await createSupplier({ brand: 'test', name: 'Dup', email: `dup-${Date.now()}@t.de`, landIso: 'DE' });
  const num = `DUP-${Date.now()}`;
  await createSupplierInvoice({ brand: 'test', supplierId: s.id, invoiceNumber: num, invoiceDate: '2026-04-01', netAmount: 10, vatAmount: 0, grossAmount: 10, category: 'misc', description: 'test' });
  await expect(
    createSupplierInvoice({ brand: 'test', supplierId: s.id, invoiceNumber: num, invoiceDate: '2026-04-01', netAmount: 10, vatAmount: 0, grossAmount: 10, category: 'misc', description: 'test' })
  ).rejects.toThrow();
});

it('cannot book an already-booked invoice', async () => {
  const s = await createSupplier({ brand: 'test', name: 'BB', email: `bb-${Date.now()}@t.de`, landIso: 'DE' });
  const inv = await createSupplierInvoice({ brand: 'test', supplierId: s.id, invoiceNumber: `BB-${Date.now()}`, invoiceDate: '2026-04-01', netAmount: 50, vatAmount: 9.5, grossAmount: 59.5, category: 'misc', description: 't' });
  await bookSupplierInvoice(inv.id, 'test');
  await expect(bookSupplierInvoice(inv.id, 'test')).rejects.toThrow('Only received');
});

it('paySupplierInvoice sets status=paid, records paid_at', async () => {
  const s = await createSupplier({ brand: 'test', name: 'Pay', email: `pay-${Date.now()}@t.de`, landIso: 'DE' });
  const inv = await createSupplierInvoice({ brand: 'test', supplierId: s.id, invoiceNumber: `PAY-${Date.now()}`, invoiceDate: '2026-04-01', netAmount: 60, vatAmount: 11.4, grossAmount: 71.4, category: 'misc', description: 't' });
  const booked = await bookSupplierInvoice(inv.id, 'test');
  const paid = await paySupplierInvoice(booked.id, 'test', { paidAt: '2026-04-15', paymentMethod: 'bank_transfer' });
  expect(paid.status).toBe('paid');
  expect(paid.paidAt).toBe('2026-04-15');
});
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
cd website && npx vitest run src/lib/supplier-billing.test.ts
```
Expected: FAIL — "Cannot find module './supplier-billing'"

- [ ] **Step 3: Create `supplier-billing.ts`**

```typescript
// website/src/lib/supplier-billing.ts
import { pool, initSupplierTables, initEurTables } from './website-db';
import { isVorsteuerEligible } from './billing-tax';
import { addBooking } from './eur-bookkeeping';

export interface Supplier {
  id: string; brand: string; name: string; email: string;
  company?: string; addressLine1?: string; city?: string;
  postalCode?: string; landIso: string; vatNumber?: string;
  steuernummer?: string; sepaIban?: string; sepaBic?: string;
  createdAt: string;
}

export interface SupplierInvoice {
  id: number; brand: string; supplierId: string;
  invoiceNumber: string; invoiceDate: string; dueDate?: string;
  netAmount: number; vatAmount: number; grossAmount: number;
  category: string; description: string;
  status: 'received' | 'booked' | 'paid';
  paymentMethod?: string; paidAt?: string;
  receiptPath?: string; vorsteuerEligible: boolean;
  eurBookingId?: number; createdAt: string;
}

export async function createSupplier(p: {
  brand: string; name: string; email: string; company?: string;
  addressLine1?: string; city?: string; postalCode?: string;
  landIso: string; vatNumber?: string; steuernummer?: string;
  sepaIban?: string; sepaBic?: string;
}): Promise<Supplier> {
  await initSupplierTables();
  const r = await pool.query(
    `INSERT INTO billing_suppliers
       (id, brand, name, email, company, address_line1, city, postal_code,
        land_iso, vat_number, steuernummer, sepa_iban, sepa_bic)
     VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [p.brand, p.name, p.email, p.company ?? null, p.addressLine1 ?? null,
     p.city ?? null, p.postalCode ?? null, p.landIso,
     p.vatNumber ?? null, p.steuernummer ?? null,
     p.sepaIban ?? null, p.sepaBic ?? null],
  );
  return mapSupplier(r.rows[0]);
}

export async function getSupplierById(brand: string, id: string): Promise<Supplier | null> {
  await initSupplierTables();
  const r = await pool.query(
    `SELECT * FROM billing_suppliers WHERE id=$1 AND brand=$2`, [id, brand]);
  return r.rows[0] ? mapSupplier(r.rows[0]) : null;
}

export async function listSuppliers(brand: string): Promise<Supplier[]> {
  await initSupplierTables();
  const r = await pool.query(
    `SELECT * FROM billing_suppliers WHERE brand=$1 ORDER BY name`, [brand]);
  return r.rows.map(mapSupplier);
}

export async function updateSupplier(
  brand: string, id: string,
  p: Partial<Omit<Supplier, 'id' | 'brand' | 'createdAt'>>,
): Promise<Supplier | null> {
  await initSupplierTables();
  const r = await pool.query(
    `UPDATE billing_suppliers SET
       name=COALESCE($3,name), email=COALESCE($4,email),
       company=COALESCE($5,company), address_line1=COALESCE($6,address_line1),
       city=COALESCE($7,city), postal_code=COALESCE($8,postal_code),
       land_iso=COALESCE($9,land_iso), vat_number=COALESCE($10,vat_number),
       steuernummer=COALESCE($11,steuernummer),
       sepa_iban=COALESCE($12,sepa_iban), sepa_bic=COALESCE($13,sepa_bic)
     WHERE id=$1 AND brand=$2
     RETURNING *`,
    [id, brand, p.name ?? null, p.email ?? null, p.company ?? null,
     p.addressLine1 ?? null, p.city ?? null, p.postalCode ?? null,
     p.landIso ?? null, p.vatNumber ?? null, p.steuernummer ?? null,
     p.sepaIban ?? null, p.sepaBic ?? null],
  );
  return r.rows[0] ? mapSupplier(r.rows[0]) : null;
}

export async function deleteSupplier(brand: string, id: string): Promise<void> {
  await initSupplierTables();
  const check = await pool.query(
    `SELECT COUNT(*)::int AS n FROM supplier_invoices WHERE supplier_id=$1`, [id]);
  if (Number(check.rows[0].n) > 0) throw new Error('Cannot delete supplier with linked invoices');
  await pool.query(`DELETE FROM billing_suppliers WHERE id=$1 AND brand=$2`, [id, brand]);
}

export async function createSupplierInvoice(p: {
  brand: string; supplierId: string; invoiceNumber: string;
  invoiceDate: string; dueDate?: string;
  netAmount: number; vatAmount: number; grossAmount: number;
  category: string; description: string; receiptPath?: string;
}): Promise<SupplierInvoice> {
  await initSupplierTables();
  const supplier = await pool.query(
    `SELECT land_iso FROM billing_suppliers WHERE id=$1 AND brand=$2`,
    [p.supplierId, p.brand],
  );
  if (!supplier.rows[0]) throw new Error(`Supplier ${p.supplierId} not found`);
  const vorsteuerEligible = isVorsteuerEligible(supplier.rows[0].land_iso as string);
  const r = await pool.query(
    `INSERT INTO supplier_invoices
       (brand, supplier_id, invoice_number, invoice_date, due_date,
        net_amount, vat_amount, gross_amount, category, description,
        receipt_path, vorsteuer_eligible)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [p.brand, p.supplierId, p.invoiceNumber, p.invoiceDate, p.dueDate ?? null,
     p.netAmount, p.vatAmount, p.grossAmount, p.category, p.description,
     p.receiptPath ?? null, vorsteuerEligible],
  );
  return mapSupplierInvoice(r.rows[0]);
}

export async function getSupplierInvoiceById(brand: string, id: number): Promise<SupplierInvoice | null> {
  await initSupplierTables();
  const r = await pool.query(
    `SELECT * FROM supplier_invoices WHERE id=$1 AND brand=$2`, [id, brand]);
  return r.rows[0] ? mapSupplierInvoice(r.rows[0]) : null;
}

export async function listSupplierInvoices(
  brand: string,
  opts?: { supplierId?: string; status?: string },
): Promise<SupplierInvoice[]> {
  await initSupplierTables();
  const conditions = ['brand=$1'];
  const params: unknown[] = [brand];
  if (opts?.supplierId) { conditions.push(`supplier_id=$${params.length + 1}`); params.push(opts.supplierId); }
  if (opts?.status)     { conditions.push(`status=$${params.length + 1}`);      params.push(opts.status); }
  const r = await pool.query(
    `SELECT * FROM supplier_invoices WHERE ${conditions.join(' AND ')} ORDER BY invoice_date DESC`,
    params,
  );
  return r.rows.map(mapSupplierInvoice);
}

export async function bookSupplierInvoice(id: number, brand: string): Promise<SupplierInvoice> {
  await initSupplierTables();
  await initEurTables();
  const r = await pool.query(
    `SELECT * FROM supplier_invoices WHERE id=$1 AND brand=$2`, [id, brand]);
  if (!r.rows[0]) throw new Error(`supplier_invoice ${id} not found`);
  const row = r.rows[0];
  if (row.status !== 'received') throw new Error('Only received invoices can be booked');

  const vatAmount = row.vorsteuer_eligible ? Number(row.vat_amount) : 0;

  const booking = await addBooking({
    brand,
    bookingDate: (row.invoice_date as Date).toISOString().split('T')[0],
    type: 'expense',
    category: row.category as string,
    description: row.description as string,
    netAmount: Number(row.net_amount),
    vatAmount,
    supplierInvoiceId: id,
    belegnummer: `SINV-${id}`,
  });

  const updated = await pool.query(
    `UPDATE supplier_invoices SET status='booked', eur_booking_id=$1 WHERE id=$2 RETURNING *`,
    [booking.id, id],
  );
  return mapSupplierInvoice(updated.rows[0]);
}

export async function paySupplierInvoice(
  id: number, brand: string,
  p: { paidAt: string; paymentMethod: string },
): Promise<SupplierInvoice> {
  await initSupplierTables();
  const r = await pool.query(
    `UPDATE supplier_invoices SET status='paid', paid_at=$1, payment_method=$2
     WHERE id=$3 AND brand=$4 AND status='booked'
     RETURNING *`,
    [p.paidAt, p.paymentMethod, id, brand],
  );
  if (!r.rows[0]) throw new Error(`supplier_invoice ${id} not found or not in booked state`);
  return mapSupplierInvoice(r.rows[0]);
}

function mapSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: row.id as string, brand: row.brand as string,
    name: row.name as string, email: row.email as string,
    company: (row.company as string) ?? undefined,
    addressLine1: (row.address_line1 as string) ?? undefined,
    city: (row.city as string) ?? undefined,
    postalCode: (row.postal_code as string) ?? undefined,
    landIso: row.land_iso as string,
    vatNumber: (row.vat_number as string) ?? undefined,
    steuernummer: (row.steuernummer as string) ?? undefined,
    sepaIban: (row.sepa_iban as string) ?? undefined,
    sepaBic: (row.sepa_bic as string) ?? undefined,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function mapSupplierInvoice(row: Record<string, unknown>): SupplierInvoice {
  return {
    id: Number(row.id), brand: row.brand as string,
    supplierId: row.supplier_id as string,
    invoiceNumber: row.invoice_number as string,
    invoiceDate: (row.invoice_date as Date).toISOString().split('T')[0],
    dueDate: row.due_date ? (row.due_date as Date).toISOString().split('T')[0] : undefined,
    netAmount: Number(row.net_amount),
    vatAmount: Number(row.vat_amount),
    grossAmount: Number(row.gross_amount),
    category: row.category as string,
    description: row.description as string,
    status: row.status as 'received' | 'booked' | 'paid',
    paymentMethod: (row.payment_method as string) ?? undefined,
    paidAt: row.paid_at ? (row.paid_at as Date).toISOString().split('T')[0] : undefined,
    receiptPath: (row.receipt_path as string) ?? undefined,
    vorsteuerEligible: row.vorsteuer_eligible as boolean,
    eurBookingId: row.eur_booking_id != null ? Number(row.eur_booking_id) : undefined,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd website && npx vitest run src/lib/supplier-billing.test.ts
```
Expected: all 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/supplier-billing.ts website/src/lib/supplier-billing.test.ts
git commit -m "feat(billing): supplier-billing.ts — Supplier + SupplierInvoice CRUD, bookSupplierInvoice"
```

---

### Task 9: API routes — suppliers and supplier invoices

**Files:**
- Create: `website/src/pages/api/admin/billing/suppliers/index.ts`
- Create: `website/src/pages/api/admin/billing/suppliers/[id].ts`
- Create: `website/src/pages/api/admin/billing/supplier-invoices/index.ts`
- Create: `website/src/pages/api/admin/billing/supplier-invoices/[id].ts`

- [ ] **Step 1: Create `suppliers/index.ts`**

```typescript
// website/src/pages/api/admin/billing/suppliers/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createSupplier, listSuppliers } from '../../../../../lib/supplier-billing';

const brand = () => process.env.BRAND || 'mentolder';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  try {
    const suppliers = await listSuppliers(brand());
    return new Response(JSON.stringify(suppliers), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[billing/suppliers GET]', err);
    return new Response('Internal Server Error', { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json();
    const supplier = await createSupplier({ brand: brand(), ...body });
    return new Response(JSON.stringify(supplier), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[billing/suppliers POST]', err);
    return new Response('Internal Server Error', { status: 500 });
  }
};
```

- [ ] **Step 2: Create `suppliers/[id].ts`**

```typescript
// website/src/pages/api/admin/billing/suppliers/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getSupplierById, updateSupplier, deleteSupplier } from '../../../../../lib/supplier-billing';

const brand = () => process.env.BRAND || 'mentolder';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const supplier = await getSupplierById(brand(), params.id!);
  if (!supplier) return new Response('Not Found', { status: 404 });
  return new Response(JSON.stringify(supplier), { headers: { 'Content-Type': 'application/json' } });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json();
    const updated = await updateSupplier(brand(), params.id!, body);
    if (!updated) return new Response('Not Found', { status: 404 });
    return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[billing/suppliers PUT]', err);
    return new Response('Internal Server Error', { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  try {
    await deleteSupplier(brand(), params.id!);
    return new Response(null, { status: 204 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const status = msg.includes('linked invoices') ? 409 : 500;
    return new Response(msg, { status });
  }
};
```

- [ ] **Step 3: Create `supplier-invoices/index.ts`**

```typescript
// website/src/pages/api/admin/billing/supplier-invoices/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createSupplierInvoice, listSupplierInvoices } from '../../../../../lib/supplier-billing';

const brand = () => process.env.BRAND || 'mentolder';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const url = new URL(request.url);
  const supplierId = url.searchParams.get('supplierId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const invoices = await listSupplierInvoices(brand(), { supplierId, status });
  return new Response(JSON.stringify(invoices), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json();
    const inv = await createSupplierInvoice({ brand: brand(), ...body });
    return new Response(JSON.stringify(inv), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[supplier-invoices POST]', err);
    return new Response('Internal Server Error', { status: 500 });
  }
};
```

- [ ] **Step 4: Create `supplier-invoices/[id].ts`**

```typescript
// website/src/pages/api/admin/billing/supplier-invoices/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  getSupplierInvoiceById, bookSupplierInvoice, paySupplierInvoice,
} from '../../../../../lib/supplier-billing';

const brand = () => process.env.BRAND || 'mentolder';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const inv = await getSupplierInvoiceById(brand(), Number(params.id));
  if (!inv) return new Response('Not Found', { status: 404 });
  return new Response(JSON.stringify(inv), { headers: { 'Content-Type': 'application/json' } });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json();
    const id = Number(params.id);
    if (body.action === 'book') {
      const booked = await bookSupplierInvoice(id, brand());
      return new Response(JSON.stringify(booked), { headers: { 'Content-Type': 'application/json' } });
    }
    if (body.action === 'pay') {
      const paid = await paySupplierInvoice(id, brand(), {
        paidAt: body.paidAt, paymentMethod: body.paymentMethod,
      });
      return new Response(JSON.stringify(paid), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Unknown action', { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const status = msg.includes('not found') ? 404 : msg.includes('Only received') ? 409 : 500;
    return new Response(msg, { status });
  }
};
```

- [ ] **Step 5: Verify compilation**

```bash
cd website && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/api/admin/billing/suppliers/ website/src/pages/api/admin/billing/supplier-invoices/
git commit -m "feat(billing): API routes for suppliers and supplier-invoices"
```

---

### Task 10: Admin UI — Lieferanten list, detail, and invoice form

**Files:**
- Create: `website/src/pages/admin/lieferanten.astro`
- Create: `website/src/pages/admin/lieferanten/[id].astro`
- Create: `website/src/components/admin/SupplierInvoiceForm.svelte`

- [ ] **Step 1: Create `lieferanten.astro` — supplier list page**

Model after the structure of an existing admin list page (e.g., `rechnungen.astro`). Use `AdminLayout` with title `"Admin — Lieferanten"`.

```astro
---
// website/src/pages/admin/lieferanten.astro
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, isAdmin } from '../../lib/auth';
import { listSuppliers } from '../../lib/supplier-billing';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session || !isAdmin(session)) return Astro.redirect('/admin/login');

const brand = process.env.BRAND || 'mentolder';
const suppliers = await listSuppliers(brand);
---
<AdminLayout title="Admin — Lieferanten">
  <div class="max-w-5xl mx-auto px-4 py-8">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-semibold">Lieferanten</h1>
      <a href="/admin/lieferanten/neu" class="btn-primary">+ Neuer Lieferant</a>
    </div>
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left border-b">
          <th class="py-2 pr-4">ID</th>
          <th class="py-2 pr-4">Name</th>
          <th class="py-2 pr-4">Land</th>
          <th class="py-2 pr-4">Steuernummer</th>
          <th class="py-2 pr-4">E-Mail</th>
        </tr>
      </thead>
      <tbody>
        {suppliers.map(s => (
          <tr class="border-b hover:bg-gray-50">
            <td class="py-2 pr-4 font-mono"><a href={`/admin/lieferanten/${s.id}`} class="text-blue-600">{s.id}</a></td>
            <td class="py-2 pr-4">{s.name}</td>
            <td class="py-2 pr-4">{s.landIso}</td>
            <td class="py-2 pr-4 text-muted">{s.steuernummer ?? '—'}</td>
            <td class="py-2 pr-4 text-muted">{s.email}</td>
          </tr>
        ))}
        {suppliers.length === 0 && (
          <tr><td colspan="5" class="py-10 text-center text-muted">Keine Lieferanten angelegt.</td></tr>
        )}
      </tbody>
    </table>
  </div>
</AdminLayout>
```

- [ ] **Step 2: Create `SupplierInvoiceForm.svelte`**

```svelte
<!-- website/src/components/admin/SupplierInvoiceForm.svelte -->
<script lang="ts">
  import { isVorsteuerEligible } from '$lib/billing-tax';

  export let supplierId: string;
  export let supplierLandIso: string;
  export let onCreated: () => void = () => {};

  const EUR_CATEGORIES = ['software', 'buero', 'marketing', 'reise', 'beratung', 'gebuehren', 'sonstiges'];

  let invoiceNumber = '';
  let invoiceDate = '';
  let dueDate = '';
  let netAmount = '';
  let vatAmount = '';
  let grossAmount = '';
  let category = EUR_CATEGORIES[0];
  let description = '';
  let error = '';
  let submitting = false;

  $: vorsteuerEligible = isVorsteuerEligible(supplierLandIso);

  async function submit() {
    submitting = true; error = '';
    try {
      const res = await fetch('/api/admin/billing/supplier-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId, invoiceNumber, invoiceDate,
          dueDate: dueDate || undefined,
          netAmount: parseFloat(netAmount),
          vatAmount: parseFloat(vatAmount || '0'),
          grossAmount: parseFloat(grossAmount),
          category, description,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      invoiceNumber = ''; invoiceDate = ''; dueDate = '';
      netAmount = ''; vatAmount = ''; grossAmount = '';
      description = '';
      onCreated();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      submitting = false;
    }
  }
</script>

<form on:submit|preventDefault={submit} class="space-y-4">
  {#if !vorsteuerEligible}
    <p class="text-xs text-amber-600">⚠ Nicht-EU-Lieferant — Vorsteuer nicht abziehbar (§15 UStG)</p>
  {/if}

  <div class="grid grid-cols-2 gap-4">
    <label class="block">
      <span class="label">Rechnungsnummer</span>
      <input bind:value={invoiceNumber} required class="input w-full" />
    </label>
    <label class="block">
      <span class="label">Rechnungsdatum</span>
      <input type="date" bind:value={invoiceDate} required class="input w-full" />
    </label>
    <label class="block">
      <span class="label">Fällig am</span>
      <input type="date" bind:value={dueDate} class="input w-full" />
    </label>
    <label class="block">
      <span class="label">Kategorie</span>
      <select bind:value={category} class="input w-full">
        {#each EUR_CATEGORIES as c}<option value={c}>{c}</option>{/each}
      </select>
    </label>
    <label class="block">
      <span class="label">Nettobetrag (€)</span>
      <input type="number" step="0.01" bind:value={netAmount} required class="input w-full" />
    </label>
    <label class="block">
      <span class="label">Vorsteuer (€)</span>
      <input type="number" step="0.01" bind:value={vatAmount} class="input w-full" />
      {#if !vorsteuerEligible}<span class="text-xs text-muted">Nicht abziehbar</span>{/if}
    </label>
    <label class="block col-span-2">
      <span class="label">Bruttobetrag (€)</span>
      <input type="number" step="0.01" bind:value={grossAmount} required class="input w-full" />
    </label>
  </div>
  <label class="block">
    <span class="label">Beschreibung</span>
    <textarea bind:value={description} required class="input w-full" rows="2"></textarea>
  </label>

  {#if error}<p class="text-red-600 text-sm">{error}</p>{/if}
  <button type="submit" disabled={submitting} class="btn-primary">
    {submitting ? 'Speichert…' : 'Rechnung erfassen'}
  </button>
</form>
```

- [ ] **Step 3: Create `lieferanten/[id].astro` — supplier detail + invoice list**

```astro
---
// website/src/pages/admin/lieferanten/[id].astro
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { getSupplierById, listSupplierInvoices } from '../../../lib/supplier-billing';
import SupplierInvoiceForm from '../../../components/admin/SupplierInvoiceForm.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session || !isAdmin(session)) return Astro.redirect('/admin/login');

const brand = process.env.BRAND || 'mentolder';
const { id } = Astro.params;
const supplier = await getSupplierById(brand, id!);
if (!supplier) return Astro.redirect('/admin/lieferanten');
const invoices = await listSupplierInvoices(brand, { supplierId: id });
---
<AdminLayout title={`Lieferant ${supplier.id}`}>
  <div class="max-w-4xl mx-auto px-4 py-8 space-y-8">
    <div>
      <h1 class="text-2xl font-semibold">{supplier.name} <span class="text-muted font-mono text-base">{supplier.id}</span></h1>
      <dl class="grid grid-cols-2 gap-x-8 gap-y-2 mt-4 text-sm">
        <dt class="text-muted">E-Mail</dt><dd>{supplier.email}</dd>
        <dt class="text-muted">Land</dt><dd>{supplier.landIso}</dd>
        {supplier.steuernummer && <><dt class="text-muted">Steuernummer</dt><dd>{supplier.steuernummer}</dd></>}
        {supplier.vatNumber && <><dt class="text-muted">USt-IdNr</dt><dd>{supplier.vatNumber}</dd></>}
        {supplier.sepaIban && <><dt class="text-muted">IBAN</dt><dd>{supplier.sepaIban}</dd></>}
      </dl>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-4">Neue Rechnung erfassen</h2>
      <SupplierInvoiceForm
        client:load
        supplierId={supplier.id}
        supplierLandIso={supplier.landIso}
      />
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-4">Eingangsrechnungen</h2>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left border-b">
            <th class="py-2 pr-4">Datum</th>
            <th class="py-2 pr-4">Nummer</th>
            <th class="py-2 pr-4">Brutto</th>
            <th class="py-2 pr-4">Vorsteuer</th>
            <th class="py-2 pr-4">Status</th>
            <th class="py-2 pr-4">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map(inv => (
            <tr class="border-b hover:bg-gray-50" data-id={inv.id}>
              <td class="py-2 pr-4">{inv.invoiceDate}</td>
              <td class="py-2 pr-4 font-mono">{inv.invoiceNumber}</td>
              <td class="py-2 pr-4">{inv.grossAmount.toFixed(2)} €</td>
              <td class="py-2 pr-4">{inv.vorsteuerEligible ? `${inv.vatAmount.toFixed(2)} €` : '—'}</td>
              <td class="py-2 pr-4"><span class="badge">{inv.status}</span></td>
              <td class="py-2 pr-4">
                {inv.status === 'received' && <button class="text-blue-600 text-xs" data-action="book" data-id={inv.id}>Buchen</button>}
                {inv.status === 'booked' && <button class="text-green-600 text-xs" data-action="pay" data-id={inv.id}>Bezahlt</button>}
              </td>
            </tr>
          ))}
          {invoices.length === 0 && (
            <tr><td colspan="6" class="py-6 text-center text-muted">Keine Rechnungen.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    document.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;
      if (action === 'book') {
        await fetch(`/api/admin/billing/supplier-invoices/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'book' }),
        });
        location.reload();
      }
      if (action === 'pay') {
        const paidAt = prompt('Zahlungsdatum (YYYY-MM-DD):');
        if (!paidAt) return;
        await fetch(`/api/admin/billing/supplier-invoices/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pay', paidAt, paymentMethod: 'bank_transfer' }),
        });
        location.reload();
      }
    });
  </script>
</AdminLayout>
```

- [ ] **Step 4: Verify compilation**

```bash
cd website && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 5: Run all billing tests**

```bash
cd website && npx vitest run src/lib/billing-tax.test.ts src/lib/supplier-billing.test.ts src/lib/native-billing.test.ts src/lib/eur-bookkeeping.test.ts
```
Expected: all tests pass

- [ ] **Step 6: Final commit — PR-G2 complete**

```bash
git add website/src/pages/admin/lieferanten.astro website/src/pages/admin/lieferanten/ website/src/components/admin/SupplierInvoiceForm.svelte
git commit -m "feat(billing): admin UI — Lieferanten list, detail, SupplierInvoiceForm"
```

---

## Self-Review Checklist

- [x] **Spec §4.1** — `billing_customers` migration: land_iso rename + typ + constraint → Tasks 2, 3
- [x] **Spec §4.2** — `billing_suppliers` with L-XXXX trigger → Task 6
- [x] **Spec §4.3** — `supplier_invoices` full structure → Task 6
- [x] **Spec §4.4** — `eur_bookings.supplier_invoice_id` + mutual exclusivity → Tasks 6, 7
- [x] **Spec §5.1** — `resolveCustomerTaxCategory` 4 branches → Task 1
- [x] **Spec §5.2** — `isVorsteuerEligible` → Task 1
- [x] **Spec §6** — All 8 API routes → Task 9
- [x] **Spec §7** — Lieferanten tab (list + detail), SupplierInvoiceForm → Task 10
- [x] **Spec §7** — `CreateInvoiceModal` hint badge → Task 5
- [x] **Spec §8** — EÜR booking on `booked` transition, `vat_amount=0` for non-EU → Tasks 7, 8
- [x] **Spec §9** — All integration tests present → Tasks 1, 8
- [x] Type consistency: `Supplier.landIso`, `SupplierInvoice.vorsteuerEligible`, `EurBooking.supplierInvoiceId` used consistently across Tasks 6-10
- [x] `mapCustomer` uses `row.land_iso` after DB rename (Task 3)
- [x] `createCustomer` ON CONFLICT updated to `(brand, email, typ)` (Task 3)
