# Plan G — Contact/Supplier Schema Rework

**Status:** Design approved  
**Date:** 2026-04-28  
**Scope:** #17 Kontakt rework (`billing_customers` + tax logic) and #18 Supplier invoices (`billing_suppliers` + `supplier_invoices` + EÜR linkage)  
**Delivery:** Two sequential PRs

---

## 1. Goal

Extend the billing data model so the workspace can manage both outgoing invoices (Kunden) and incoming invoices (Lieferanten) in a single admin surface, with correct German tax handling for cross-border scenarios (reverse-charge, Vorsteuer eligibility) derived automatically from the contact's country.

## 2. Non-Goals

- Automatic Vorsteuer pre-fill on the annual UStVA export (EÜR data is stored; UStVA integration is a later plan).
- Supplier portal / external supplier login.
- Multi-currency supplier invoices (EUR only).
- Bulk import of supplier contacts.
- Supplier dunning / reminder flows.

## 3. Delivery Sequence

| PR | Feature | Depends on |
|----|---------|------------|
| PR-G1 | `#17` Kontakt rework — `land_iso` rename, `billing_tax.ts` helpers, `CreateInvoiceModal` auto-fill | — |
| PR-G2 | `#18` Supplier invoices — `billing_suppliers`, `supplier_invoices`, EÜR linkage, admin UI | PR-G1 |

---

## 4. Data Model

### 4.1 `billing_customers` (migration only)

```sql
-- Rename column (transparent to TypeScript mapper — field name stays 'country' until mapper updated)
ALTER TABLE billing_customers RENAME COLUMN country TO land_iso;

-- Add typ column (degenerate CHECK, forward-compatible)
ALTER TABLE billing_customers
  ADD COLUMN IF NOT EXISTS typ TEXT NOT NULL DEFAULT 'Kunde'
  CHECK (typ IN ('Kunde'));

-- Widen unique constraint to include typ
ALTER TABLE billing_customers DROP CONSTRAINT IF EXISTS billing_customers_brand_email_key;
ALTER TABLE billing_customers
  ADD CONSTRAINT billing_customers_brand_email_typ_key UNIQUE (brand, email, typ);
```

TypeScript mapper update: rename `country` field to `landIso` in the `Customer` interface and all callsites.

### 4.2 `billing_suppliers` (new)

```sql
CREATE SEQUENCE IF NOT EXISTS supplier_seq;

CREATE TABLE billing_suppliers (
  id            TEXT PRIMARY KEY,          -- 'L-0001', 'L-0002', …
  brand         TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  company       TEXT,
  address_line1 TEXT,
  city          TEXT,
  postal_code   TEXT,
  land_iso      CHAR(2) NOT NULL DEFAULT 'DE',
  vat_number    TEXT,                      -- USt-IdNr (EU format)
  steuernummer  TEXT,                      -- Finanzamt-Nummer (suppliers only)
  sepa_iban     TEXT,
  sepa_bic      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand, email)
);

-- ID generation trigger: 'L-' || LPAD(nextval('supplier_seq')::text, 4, '0')
CREATE OR REPLACE FUNCTION billing_suppliers_gen_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.id := 'L-' || LPAD(nextval('supplier_seq')::text, 4, '0');
  RETURN NEW;
END $$;

CREATE TRIGGER billing_suppliers_id_trigger
  BEFORE INSERT ON billing_suppliers
  FOR EACH ROW WHEN (NEW.id IS NULL OR NEW.id = '')
  EXECUTE FUNCTION billing_suppliers_gen_id();
```

### 4.3 `supplier_invoices` (new)

```sql
CREATE TABLE supplier_invoices (
  id                 BIGSERIAL PRIMARY KEY,
  brand              TEXT NOT NULL,
  supplier_id        TEXT NOT NULL REFERENCES billing_suppliers(id),
  invoice_number     TEXT NOT NULL,
  invoice_date       DATE NOT NULL,
  due_date           DATE,
  net_amount         NUMERIC(12,2) NOT NULL,
  vat_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_amount       NUMERIC(12,2) NOT NULL,
  category           TEXT NOT NULL,        -- EÜR Betriebsausgaben category
  description        TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'booked', 'paid')),
  payment_method     TEXT,
  paid_at            DATE,
  receipt_path       TEXT,
  vorsteuer_eligible BOOLEAN NOT NULL,     -- stored at insert time from supplier land_iso
  eur_booking_id     BIGINT REFERENCES eur_bookings(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand, supplier_id, invoice_number)
);
```

### 4.4 `eur_bookings` extension

```sql
ALTER TABLE eur_bookings
  ADD COLUMN IF NOT EXISTS supplier_invoice_id BIGINT REFERENCES supplier_invoices(id);

-- Mutual exclusivity: a booking links to outgoing OR incoming, never both
ALTER TABLE eur_bookings
  ADD CONSTRAINT eur_bookings_source_chk
    CHECK (NOT (invoice_id IS NOT NULL AND supplier_invoice_id IS NOT NULL));
```

---

## 5. Tax Logic (`website/src/lib/billing-tax.ts`)

Two pure helper functions, no DB dependency.

### 5.1 `resolveCustomerTaxCategory`

```typescript
function resolveCustomerTaxCategory(
  landIso: string,
  vatNumber: string | undefined
): 'S' | 'AE' | 'Z'
```

| Condition | Result | Rationale |
|-----------|--------|-----------|
| `landIso === 'DE'` | `'S'` | Domestic — standard rate |
| EU country + `vatNumber` present | `'AE'` | §13b UStG — reverse charge |
| EU country + no `vatNumber` | `'S'` | Private EU customer — no reverse charge |
| Non-EU country | `'Z'` | Zero-rated export |

EU membership is a static `Set<string>` of 27 ISO-3166-1 alpha-2 codes defined once in this file.

### 5.2 `isVorsteuerEligible`

```typescript
function isVorsteuerEligible(landIso: string): boolean
```

Returns `true` for DE and all EU countries (§15 UStG), `false` for non-EU imports.

---

## 6. API Routes

### PR-G1 — Customer extension
No new routes. `CreateInvoiceModal.svelte` updated: when a customer is selected, `resolveCustomerTaxCategory(customer.landIso, customer.vatNumber)` auto-fills the tax category field (admin can override before finalizing).

### PR-G2 — Supplier CRUD

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/billing/suppliers` | List suppliers (brand-scoped) |
| POST | `/api/admin/billing/suppliers` | Create supplier (trigger generates L-XXXX id) |
| GET | `/api/admin/billing/suppliers/[id]` | Get single supplier |
| PUT | `/api/admin/billing/suppliers/[id]` | Update supplier |
| DELETE | `/api/admin/billing/suppliers/[id]` | Delete supplier (only if no linked invoices) |
| GET | `/api/admin/billing/supplier-invoices` | List supplier invoices (filterable by status) |
| POST | `/api/admin/billing/supplier-invoices` | Create supplier invoice; computes `vorsteuer_eligible` |
| GET | `/api/admin/billing/supplier-invoices/[id]` | Get single supplier invoice |
| PUT | `/api/admin/billing/supplier-invoices/[id]` | Update status/paid_at; triggers EÜR row on → booked |

---

## 7. Admin UI

### `/admin/billing` (existing page)
Gains a **"Lieferanten"** tab (alongside existing "Kunden") showing a table: `L-XXXX`, name, land_iso, `steuernummer`, open payables count.

### Supplier detail page
Fields: name, company, email, address, `land_iso` (ISO dropdown), `vat_number`, `steuernummer`, IBAN/BIC. Linked `supplier_invoices` list below.

### Supplier invoice form
Fields: supplier picker, invoice number, dates (invoice_date, due_date), net/VAT/gross amounts, category dropdown (reuses existing EÜR category list), description, receipt upload. `vorsteuer_eligible` shown as read-only badge derived from supplier's `land_iso`. Status pill with transition button (received → booked → paid; paid requires `paid_at` + `payment_method`).

### `CreateInvoiceModal.svelte` (existing)
When customer is selected and `landIso` is available, tax category auto-fills; admin can override inline.

---

## 8. EÜR Integration

On `supplier_invoice` status transition `* → 'booked'`:

```
INSERT INTO eur_bookings (
  brand, booking_date, type, category,
  description, net_amount, vat_amount,
  supplier_invoice_id
) VALUES (
  brand, invoice_date, 'Ausgabe', category,
  description, net_amount,
  CASE WHEN vorsteuer_eligible THEN vat_amount ELSE 0 END,
  supplier_invoice.id
)
```

`eur_bookings.invoice_id` remains NULL for supplier-originated bookings. The mutual-exclusivity CHECK constraint enforces this.

On transition to `'paid'`: only `paid_at` + `payment_method` updated — no second EÜR row.

---

## 9. Testing

| Layer | Test |
|-------|------|
| Unit | `resolveCustomerTaxCategory` — DE→S, EU+VAT→AE, EU no VAT→S, non-EU→Z |
| Unit | `isVorsteuerEligible` — DE→true, FR→true, US→false |
| Unit | `L-XXXX` trigger: sequential inserts produce L-0001, L-0002, … |
| Integration | Create supplier (DE) → create invoice → transition to booked → assert `eur_bookings` row with `vat_amount = invoice.vat_amount` |
| Integration | Same for US supplier → assert `eur_bookings.vat_amount = 0` |
| Integration | Duplicate `(brand, supplier_id, invoice_number)` rejected |
| Integration | `billing_customers` unique constraint `(brand, email, typ)` — same email for different brands allowed; same email+brand rejected |
| Integration | `eur_bookings` CHECK: row with both `invoice_id` and `supplier_invoice_id` set → rejected |
