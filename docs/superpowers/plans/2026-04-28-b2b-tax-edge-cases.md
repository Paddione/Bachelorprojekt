# Plan F — B2B Tax Edge Cases

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the native billing system to correctly handle four German/EU tax edge cases: §13b reverse charge (with VIES validation + ZM trigger), intra-community goods supply (KZ 41 + Nachweis), third-country export (Ausfuhrnachweis + KZ 43), and foreign-currency invoicing (ECB rate lookup + Kursdifferenz booking).

**Architecture:** Each feature adds columns to `billing_invoices` via `initBillingTables()` ADD COLUMN IF NOT EXISTS migrations, two new tables (`billing_nachweis`, `vat_id_validations`), and four new library files. The existing `Invoice` interface, `createInvoice`, `recordPayment`, `invoice-pdf`, `skr`, and `getUstvaExport` are extended—never rewritten.

**Tech Stack:** TypeScript + Vitest (existing), Node.js global `fetch` (Node 18+, already in use for sidecar client), PDFKit (existing), PostgreSQL 16 (existing), ECB XML feed (no auth), VIES REST API (`https://ec.europa.eu/taxation_customs/vies/rest-api`).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `website/src/lib/website-db.ts` | Modify | DB migrations: 6 new invoice columns, 2 new tables |
| `website/src/lib/skr.ts` | Modify | Add SKR 8338, 8120, 2668, 2669 accounts |
| `website/src/lib/ecb-exchange-rates.ts` | Create | ECB XML rate fetch → EUR-per-unit map |
| `website/src/lib/native-billing.ts` | Modify | `Invoice` + `createInvoice`: currency, supply_type, EUR amounts |
| `website/src/lib/invoice-payments.ts` | Modify | `recordPayment`: Kursdifferenz booking when rate changes |
| `website/src/lib/vat-id-validation.ts` | Create | VIES POST qualified check + DB persist |
| `website/src/lib/supply-nachweis.ts` | Create | CRUD for `billing_nachweis` (EU + export evidence) |
| `website/src/lib/invoice-pdf.ts` | Modify | Add reverse-charge, EU-supply, export notices |
| `website/src/lib/tax-monitor.ts` | Modify | Extend `getUstvaExport` with KZ 41/43; new `getZmEntries` |
| `website/src/lib/skr.test.ts` | Modify | Tests for new accounts |
| `website/src/lib/ecb-exchange-rates.test.ts` | Create | Unit tests (mocked fetch) |
| `website/src/lib/vat-id-validation.test.ts` | Create | Unit tests (mocked fetch) |
| `website/src/lib/supply-nachweis.test.ts` | Create | Integration tests (real DB) |
| `website/src/lib/invoice-pdf.test.ts` | Modify | Tests for new notice text |
| `website/src/lib/tax-monitor.test.ts` | Modify | Tests for KZ 41/43 + ZM entries |
| `website/src/lib/invoice-payments.test.ts` | Modify | Kursdifferenz booking test |
| `website/src/lib/native-billing.test.ts` | Modify | Currency + supply_type round-trip test |

---

## Task 1: DB Migrations

**Files:**
- Modify: `website/src/lib/website-db.ts` (inside `initBillingTables()`, after the last existing `ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS` block around line 3235)

- [ ] **Step 1: Write the failing test**

In a new file `website/src/lib/native-billing.test.ts`, add after the existing tests:

```typescript
it('billing_invoices has currency, supply_type, EUR amount columns', async () => {
  await initBillingTables();
  const r = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='billing_invoices'
    AND column_name IN ('currency','currency_rate','net_amount_eur','gross_amount_eur','supply_type')
  `);
  const cols = r.rows.map((x: { column_name: string }) => x.column_name).sort();
  expect(cols).toEqual(['currency','currency_rate','gross_amount_eur','net_amount_eur','supply_type'].sort());
});

it('billing_nachweis table exists', async () => {
  await initBillingTables();
  const r = await pool.query(`SELECT to_regclass('billing_nachweis')`);
  expect(r.rows[0].to_regclass).toBe('billing_nachweis');
});

it('vat_id_validations table exists', async () => {
  await initBillingTables();
  const r = await pool.query(`SELECT to_regclass('vat_id_validations')`);
  expect(r.rows[0].to_regclass).toBe('vat_id_validations');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
```

Expected: FAIL — columns / tables missing.

- [ ] **Step 3: Add migrations in `website-db.ts`**

Inside `initBillingTables()`, after the block ending at line 3236 (`ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ`), add:

```typescript
  // Plan F: currency, supply_type, EUR equivalents
  await pool.query(`
    ALTER TABLE billing_invoices
      ADD COLUMN IF NOT EXISTS currency        TEXT NOT NULL DEFAULT 'EUR',
      ADD COLUMN IF NOT EXISTS currency_rate   NUMERIC(12,6),
      ADD COLUMN IF NOT EXISTS net_amount_eur  NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS gross_amount_eur NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS supply_type     TEXT
  `);
  // Plan F: EU supply + export evidence
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_nachweis (
      id           BIGSERIAL PRIMARY KEY,
      invoice_id   TEXT NOT NULL REFERENCES billing_invoices(id),
      brand        TEXT NOT NULL,
      type         TEXT NOT NULL,
      received_at  DATE,
      document_ref TEXT,
      notes        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Plan F: VAT ID validation log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vat_id_validations (
      id                  BIGSERIAL PRIMARY KEY,
      customer_id         TEXT REFERENCES billing_customers(id),
      vat_id              TEXT NOT NULL,
      country_code        CHAR(2) NOT NULL,
      valid               BOOLEAN NOT NULL,
      vies_name           TEXT,
      vies_address        TEXT,
      request_identifier  TEXT,
      validated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Plan F: billing_invoice_payments — rate at payment time
  await pool.query(`
    ALTER TABLE billing_invoice_payments
      ADD COLUMN IF NOT EXISTS payment_currency_rate NUMERIC(12,6)
  `);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
```

Expected: PASS (all three new tests green, existing tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/website-db.ts website/src/lib/native-billing.test.ts
git commit -m "feat(billing): DB migrations — currency, supply_type, nachweis, vat_id_validations"
```

---

## Task 2: SKR Account Additions

**Files:**
- Modify: `website/src/lib/skr.ts`
- Modify: `website/src/lib/skr.test.ts`

- [ ] **Step 1: Write failing tests**

In `website/src/lib/skr.test.ts`, add:

```typescript
import { describe, it, expect } from 'vitest';
import { skrAccountFor } from './skr';

// (Keep any existing tests)

describe('skrAccountFor — Plan F accounts', () => {
  it('returns 8338 for eu_b2b_services income', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'income', category: 'eu_b2b_services' })).toBe('8338');
  });
  it('returns 8338 for eu_b2b_goods income', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'income', category: 'eu_b2b_goods' })).toBe('8338');
  });
  it('returns 8120 for drittland_export income', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'income', category: 'drittland_export' })).toBe('8120');
  });
  it('returns 2668 for positive kursdifferenz income', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'income', category: 'kursdifferenz_gewinn' })).toBe('2668');
  });
  it('returns 4930 for negative kursdifferenz expense', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'expense', category: 'kursdifferenz_verlust' })).toBe('4930');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd website && npx vitest run src/lib/skr.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Extend `skr.ts`**

Replace the current `skrAccountFor` body with:

```typescript
export function skrAccountFor(p: SkrInput): string {
  if (p.type === 'income') {
    if (p.category === 'eu_b2b_services' || p.category === 'eu_b2b_goods') return '8338';
    if (p.category === 'drittland_export') return '8120';
    if (p.category === 'kursdifferenz_gewinn') return '2668';
    return p.taxMode === 'kleinunternehmer' ? '8195' : '8400';
  }
  if (p.type === 'expense') {
    if (p.category === 'kursdifferenz_verlust') return '4930';
    return '4980';
  }
  if (p.type === 'pretax') return '1576';
  if (p.type === 'vat_payment') return '1780';
  if (p.type === 'vat_refund') return '1781';
  return '4980';
}
```

- [ ] **Step 4: Run tests**

```bash
cd website && npx vitest run src/lib/skr.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/skr.ts website/src/lib/skr.test.ts
git commit -m "feat(billing): SKR 8338/8120/2668/4930 for EU B2B, export, Kursdifferenz"
```

---

## Task 3: ECB Exchange Rate Lookup (#16)

**Files:**
- Create: `website/src/lib/ecb-exchange-rates.ts`
- Create: `website/src/lib/ecb-exchange-rates.test.ts`

- [ ] **Step 1: Write failing test**

Create `website/src/lib/ecb-exchange-rates.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchEcbRates, eurPer } from './ecb-exchange-rates';

const MOCK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01"
  xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time="2026-04-28">
      <Cube currency="USD" rate="1.1398"/>
      <Cube currency="GBP" rate="0.8598"/>
      <Cube currency="CHF" rate="0.9312"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

afterEach(() => vi.restoreAllMocks());

describe('fetchEcbRates', () => {
  it('returns EUR-per-unit map from ECB XML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => MOCK_XML,
    }));
    const rates = await fetchEcbRates();
    expect(rates.USD).toBeCloseTo(1 / 1.1398, 5);
    expect(rates.GBP).toBeCloseTo(1 / 0.8598, 5);
    expect(rates.CHF).toBeCloseTo(1 / 0.9312, 5);
    expect(rates.EUR).toBe(1);
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchEcbRates()).rejects.toThrow('ECB rate fetch failed: 503');
  });
});

describe('eurPer', () => {
  it('returns 1 for EUR', () => expect(eurPer('EUR', { EUR: 1, USD: 0.877 })).toBe(1));
  it('returns mapped rate for known currency', () => expect(eurPer('USD', { EUR: 1, USD: 0.877 })).toBeCloseTo(0.877));
  it('throws for unknown currency', () => {
    expect(() => eurPer('ZZZ', { EUR: 1 })).toThrow('No ECB rate for ZZZ');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd website && npx vitest run src/lib/ecb-exchange-rates.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ecb-exchange-rates.ts`**

```typescript
const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

export type RateMap = Record<string, number>;

export async function fetchEcbRates(): Promise<RateMap> {
  const res = await fetch(ECB_URL);
  if (!res.ok) throw new Error(`ECB rate fetch failed: ${res.status}`);
  const xml = await res.text();
  const map: RateMap = { EUR: 1 };
  for (const m of xml.matchAll(/currency="([A-Z]{3})" rate="([\d.]+)"/g)) {
    map[m[1]] = 1 / parseFloat(m[2]);
  }
  return map;
}

export function eurPer(currency: string, rates: RateMap): number {
  if (currency === 'EUR') return 1;
  const r = rates[currency];
  if (r === undefined) throw new Error(`No ECB rate for ${currency}`);
  return r;
}
```

- [ ] **Step 4: Run tests**

```bash
cd website && npx vitest run src/lib/ecb-exchange-rates.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/ecb-exchange-rates.ts website/src/lib/ecb-exchange-rates.test.ts
git commit -m "feat(billing): ECB EUR-per-unit exchange rate lookup"
```

---

## Task 4: Currency Support in Invoice Model (#16)

**Files:**
- Modify: `website/src/lib/native-billing.ts`
- Modify: `website/src/lib/native-billing.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `website/src/lib/native-billing.test.ts`:

```typescript
import { vi, afterEach } from 'vitest';

afterEach(() => vi.restoreAllMocks());

it('createInvoice with USD stores currency_rate and eur amounts', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: async () => `<?xml version="1.0"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube><Cube time="2026-04-28"><Cube currency="USD" rate="1.1398"/></Cube></Cube></gesmes:Envelope>`,
  }));
  const c = await createCustomer({ brand: 'test', name: 'US Corp', email: `uscorp-${Date.now()}@test.com` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 30,
    taxMode: 'regelbesteuerung', taxRate: 19,
    currency: 'USD',
    lines: [{ description: 'Service', quantity: 1, unitPrice: 1000 }],
  });
  expect(inv.currency).toBe('USD');
  expect(inv.currencyRate).toBeCloseTo(1 / 1.1398, 4);
  // net = 1000 USD, netAmountEur ≈ 877.35 EUR
  expect(inv.netAmountEur).toBeCloseTo(1000 / 1.1398, 1);
  expect(inv.grossAmountEur).toBeCloseTo(1190 / 1.1398, 1);
});

it('createInvoice with EUR sets currencyRate null and eur = net', async () => {
  const c = await createCustomer({ brand: 'test', name: 'Local GmbH', email: `local-${Date.now()}@test.de` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 14,
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'Coaching', quantity: 1, unitPrice: 120 }],
  });
  expect(inv.currency).toBe('EUR');
  expect(inv.currencyRate).toBeNull();
  expect(inv.netAmountEur).toBe(120);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
```

Expected: FAIL — `currency` not in interface.

- [ ] **Step 3: Extend `Invoice` interface in `native-billing.ts`**

After line 60 (`leitwegId?: string;`), add:

```typescript
  currency: string;
  currencyRate: number | null;
  netAmountEur: number;
  grossAmountEur: number;
  supplyType?: string;
```

- [ ] **Step 4: Update `createInvoice` signature**

In `createInvoice`, add `currency?: string; supplyType?: string;` to parameter type after `leitwegId?`:

```typescript
export async function createInvoice(p: {
  brand: string; customerId: string; issueDate: string; dueDays: number;
  taxMode: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number; lines: InvoiceLine[]; notes?: string;
  servicePeriodStart?: string; servicePeriodEnd?: string;
  leitwegId?: string;
  currency?: string;
  supplyType?: string;
}): Promise<Invoice> {
```

- [ ] **Step 5: Add ECB lookup and EUR columns to `createInvoice` body**

At the top of `createInvoice`, after `await initBillingTables();`, add:

```typescript
  const currency = p.currency ?? 'EUR';
  let currencyRate: number | null = null;
  if (currency !== 'EUR') {
    const { fetchEcbRates, eurPer } = await import('./ecb-exchange-rates');
    const rates = await fetchEcbRates();
    currencyRate = eurPer(currency, rates);
  }
```

Replace the existing `netAmount / taxRate / taxAmount / grossAmount` block with the same logic unchanged, then add after `const grossAmount`:

```typescript
  const netAmountEur  = currencyRate !== null ? Math.round(netAmount * currencyRate * 100) / 100 : netAmount;
  const grossAmountEur = currencyRate !== null ? Math.round(grossAmount * currencyRate * 100) / 100 : grossAmount;
```

- [ ] **Step 6: Update the INSERT in `createInvoice`**

Replace the INSERT SQL and values array (lines 85–94) with:

```typescript
    const r = await client.query(
      `INSERT INTO billing_invoices (brand, number, customer_id, issue_date, due_date,
         service_period_start, service_period_end, tax_mode, net_amount, tax_rate,
         tax_amount, gross_amount, notes, payment_reference, leitweg_id,
         currency, currency_rate, net_amount_eur, gross_amount_eur, supply_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [p.brand, number, p.customerId, p.issueDate,
       dueDate.toISOString().split('T')[0],
       p.servicePeriodStart??null, p.servicePeriodEnd??null,
       p.taxMode, netAmount, taxRate, taxAmount, grossAmount,
       p.notes??null, paymentRef, p.leitwegId??null,
       currency, currencyRate, netAmountEur, grossAmountEur, p.supplyType??null]
    );
```

- [ ] **Step 7: Extend `mapInvoice`**

In `mapInvoice`, after `leitwegId: ...`, add:

```typescript
    currency: (row.currency as string) ?? 'EUR',
    currencyRate: row.currency_rate != null ? Number(row.currency_rate) : null,
    netAmountEur: row.net_amount_eur != null ? Number(row.net_amount_eur) : Number(row.net_amount),
    grossAmountEur: row.gross_amount_eur != null ? Number(row.gross_amount_eur) : Number(row.gross_amount),
    supplyType: (row.supply_type as string) ?? undefined,
```

- [ ] **Step 8: Run tests**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add website/src/lib/native-billing.ts website/src/lib/native-billing.test.ts
git commit -m "feat(billing): currency + supply_type on Invoice; ECB rate at creation"
```

---

## Task 5: Kursdifferenz Booking on Payment (#16)

**Files:**
- Modify: `website/src/lib/invoice-payments.ts`
- Modify: `website/src/lib/invoice-payments.test.ts`

- [ ] **Step 1: Write failing test**

Add to `website/src/lib/invoice-payments.test.ts`:

```typescript
import { createCustomer, createInvoice, finalizeInvoice } from './native-billing';
import { recordPayment, listPayments } from './invoice-payments';
import { pool } from './website-db';
import { vi, afterEach } from 'vitest';

afterEach(() => vi.restoreAllMocks());

it('records Kursdifferenz booking when paymentCurrencyRate differs from invoice rate', async () => {
  // Mock ECB for invoice creation at 1 USD = 0.92 EUR
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: async () => `<?xml version="1.0"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube><Cube time="2026-04-28"><Cube currency="USD" rate="1.0870"/></Cube></Cube></gesmes:Envelope>`,
  }));
  const c = await createCustomer({ brand: 'test', name: 'USD Corp', email: `usdcorp-${Date.now()}@test.com` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 30,
    taxMode: 'kleinunternehmer', currency: 'USD',
    lines: [{ description: 'License', quantity: 1, unitPrice: 1000 }],
  });
  // invoice rate: 1/1.087 ≈ 0.92 EUR/USD
  await finalizeInvoice(inv.id, { actor: { userId: 'u1', email: 'u@t.de' } });

  // Payment at a different rate: 1 USD = 0.95 EUR → Kursdifferenzgewinn
  const payment = await recordPayment({
    invoiceId: inv.id, paidAt: '2026-05-15', amount: 1000,
    method: 'bank', recordedBy: 'admin',
    paymentCurrencyRate: 0.95,
  });
  expect(payment.id).toBeGreaterThan(0);

  // A Kursdifferenz EUR booking should exist
  const kdBookings = await pool.query(
    `SELECT category, net_amount, skr_konto FROM eur_bookings WHERE invoice_id=$1 AND category LIKE 'kursdifferenz%'`,
    [inv.id],
  );
  expect(kdBookings.rows).toHaveLength(1);
  // 1000 USD * (0.95 - 0.92) = +30 EUR gain
  expect(Number(kdBookings.rows[0].net_amount)).toBeCloseTo(30, 0);
  expect(kdBookings.rows[0].category).toBe('kursdifferenz_gewinn');
  expect(kdBookings.rows[0].skr_konto).toBe('2668');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd website && npx vitest run src/lib/invoice-payments.test.ts
```

Expected: FAIL — `paymentCurrencyRate` not accepted.

- [ ] **Step 3: Extend `RecordPaymentInput` in `invoice-payments.ts`**

Add `paymentCurrencyRate?: number;` after `notes?` in `RecordPaymentInput`.

- [ ] **Step 4: Add Kursdifferenz logic in `recordPayment`**

After the `await addBooking({...})` call (around line 91–104), add:

```typescript
    // Kursdifferenz: only when invoice is in foreign currency and a different payment rate is provided
    const invCurrency = inv.currency ?? 'EUR';
    const invoiceRate = inv.currency_rate != null ? Number(inv.currency_rate) : null;
    if (invCurrency !== 'EUR' && invoiceRate !== null && p.paymentCurrencyRate !== undefined) {
      const rateDiff = p.paymentCurrencyRate - invoiceRate;
      const kdAmount = Math.round(p.amount * rateDiff * 100) / 100;
      if (Math.abs(kdAmount) >= 0.01) {
        const isGain = kdAmount > 0;
        await addBooking({
          brand:       inv.brand,
          bookingDate: p.paidAt,
          type:        isGain ? 'income' : 'expense',
          category:    isGain ? 'kursdifferenz_gewinn' : 'kursdifferenz_verlust',
          description: `Kursdifferenz ${inv.number} (${invCurrency})`,
          netAmount:   Math.abs(kdAmount),
          vatAmount:   0,
          invoiceId:   p.invoiceId,
          belegnummer: inv.number,
        });
      }
    }
```

Also store `paymentCurrencyRate` in the INSERT on line 60–66:

```typescript
    const ins = await client.query(
      `INSERT INTO billing_invoice_payments
         (invoice_id, brand, paid_at, amount, method, reference, recorded_by, notes, payment_currency_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [p.invoiceId, inv.brand, p.paidAt, p.amount, p.method,
       p.reference ?? null, p.recordedBy, p.notes ?? null, p.paymentCurrencyRate ?? null],
    );
```

- [ ] **Step 5: Run tests**

```bash
cd website && npx vitest run src/lib/invoice-payments.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/invoice-payments.ts website/src/lib/invoice-payments.test.ts
git commit -m "feat(billing): Kursdifferenz booking on payment for foreign-currency invoices"
```

---

## Task 6: VIES VAT ID Validation (#12)

**Files:**
- Create: `website/src/lib/vat-id-validation.ts`
- Create: `website/src/lib/vat-id-validation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `website/src/lib/vat-id-validation.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkViesVatId, parseVatIdCountry } from './vat-id-validation';

afterEach(() => vi.restoreAllMocks());

describe('parseVatIdCountry', () => {
  it('extracts 2-letter country prefix', () => {
    expect(parseVatIdCountry('DE123456789')).toBe('DE');
    expect(parseVatIdCountry('FR12345678901')).toBe('FR');
    expect(parseVatIdCountry('NL123456789B01')).toBe('NL');
  });
  it('throws for non-2-letter prefix', () => {
    expect(() => parseVatIdCountry('123456789')).toThrow('Invalid VAT ID format');
  });
});

describe('checkViesVatId', () => {
  it('returns valid=true for a valid VIES response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        isValid: true,
        name: 'ACME GMBH',
        address: 'Musterstr 1, 10115 Berlin',
        requestIdentifier: 'WAPIAAAAWbcHHAvv',
        requestDate: '2026-04-28',
      }),
    }));
    const result = await checkViesVatId({ vatId: 'DE123456789', requesterVatId: 'DE987654321' });
    expect(result.valid).toBe(true);
    expect(result.name).toBe('ACME GMBH');
    expect(result.requestIdentifier).toBe('WAPIAAAAWbcHHAvv');
  });

  it('returns valid=false for invalid VIES response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isValid: false }),
    }));
    const result = await checkViesVatId({ vatId: 'DE000000000' });
    expect(result.valid).toBe(false);
    expect(result.name).toBeUndefined();
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(checkViesVatId({ vatId: 'FR12345678901' })).rejects.toThrow('VIES');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd website && npx vitest run src/lib/vat-id-validation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `vat-id-validation.ts`**

```typescript
import { pool, initBillingTables } from './website-db';

const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

export interface ViesResult {
  valid: boolean;
  name?: string;
  address?: string;
  requestIdentifier?: string;
  validatedAt: string;
}

export function parseVatIdCountry(vatId: string): string {
  if (!/^[A-Z]{2}/.test(vatId)) throw new Error('Invalid VAT ID format: must start with 2-letter country code');
  return vatId.slice(0, 2);
}

export async function checkViesVatId(p: {
  vatId: string;
  requesterVatId?: string;
  customerId?: string;
}): Promise<ViesResult> {
  const cc = parseVatIdCountry(p.vatId);
  const vatNumber = p.vatId.slice(2);
  const body: Record<string, string> = { countryCode: cc, vatNumber };
  if (p.requesterVatId) {
    body.requesterCountryCode = 'DE';
    body.requesterVatNumber = p.requesterVatId.slice(2);
  }

  const res = await fetch(VIES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`VIES check failed: ${res.status}`);
  const data = await res.json() as {
    isValid: boolean; name?: string; address?: string; requestIdentifier?: string;
  };

  const result: ViesResult = {
    valid: data.isValid,
    name: data.name ?? undefined,
    address: data.address ?? undefined,
    requestIdentifier: data.requestIdentifier ?? undefined,
    validatedAt: new Date().toISOString(),
  };

  if (p.customerId) {
    await initBillingTables();
    await pool.query(
      `INSERT INTO vat_id_validations
         (customer_id, vat_id, country_code, valid, vies_name, vies_address, request_identifier)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [p.customerId, p.vatId, cc, data.isValid,
       data.name ?? null, data.address ?? null, data.requestIdentifier ?? null],
    );
  }

  return result;
}

export async function getLatestVatValidation(customerId: string): Promise<ViesResult | null> {
  await initBillingTables();
  const r = await pool.query(
    `SELECT * FROM vat_id_validations WHERE customer_id=$1 ORDER BY validated_at DESC LIMIT 1`,
    [customerId],
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return {
    valid: Boolean(row.valid),
    name: row.vies_name ?? undefined,
    address: row.vies_address ?? undefined,
    requestIdentifier: row.request_identifier ?? undefined,
    validatedAt: row.validated_at.toISOString(),
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd website && npx vitest run src/lib/vat-id-validation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/vat-id-validation.ts website/src/lib/vat-id-validation.test.ts
git commit -m "feat(billing): VIES qualifizierte Bestätigung for EU buyer VAT IDs"
```

---

## Task 7: Reverse Charge Enforcement + PDF Notice (#12)

**Files:**
- Modify: `website/src/lib/native-billing.ts` (enforce vatId + auto supply_type for AE invoices)
- Modify: `website/src/lib/invoice-pdf.ts` (add reverse charge notice)
- Modify: `website/src/lib/invoice-pdf.test.ts`
- Modify: `website/src/lib/native-billing.test.ts`

- [ ] **Step 1: Write failing test for enforcement**

Add to `website/src/lib/native-billing.test.ts`:

```typescript
it('createInvoice with AE line requires buyer vatNumber on customer', async () => {
  const c = await createCustomer({
    brand: 'test', name: 'EU Corp', email: `eucorp-${Date.now()}@test.eu`,
    // NO vatNumber
  });
  await expect(createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 30,
    taxMode: 'regelbesteuerung', taxRate: 0,
    lines: [{ description: 'Consulting', quantity: 1, unitPrice: 500, taxCategory: 'AE' }],
  })).rejects.toThrow('Reverse charge (AE) requires a VAT ID on the customer');
});

it('createInvoice with AE line sets supplyType eu_b2b_services automatically', async () => {
  const c = await createCustomer({
    brand: 'test', name: 'EU Corp 2', email: `eucorp2-${Date.now()}@test.eu`,
    vatNumber: 'FR12345678901',
  });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 30,
    taxMode: 'regelbesteuerung', taxRate: 0,
    lines: [{ description: 'Consulting', quantity: 1, unitPrice: 500, taxCategory: 'AE' }],
  });
  expect(inv.supplyType).toBe('eu_b2b_services');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
```

Expected: FAIL — no enforcement yet.

- [ ] **Step 3: Add AE enforcement + auto supply_type in `createInvoice`**

The `InvoiceLine` interface in `native-billing.ts` doesn't have `taxCategory`. The enforcement must look up the customer. Add this block after `await initBillingTables();` in `createInvoice`:

```typescript
  // Reverse charge enforcement
  const hasAeLines = (p.lines as Array<InvoiceLine & { taxCategory?: string }>)
    .some(l => l.taxCategory === 'AE');
  if (hasAeLines) {
    const customer = await getCustomerById(p.brand, p.customerId);
    if (!customer?.vatNumber) {
      throw new Error('Reverse charge (AE) requires a VAT ID on the customer');
    }
    if (!p.supplyType) p = { ...p, supplyType: 'eu_b2b_services' };
  }
```

Also extend the `InvoiceLine` interface in `native-billing.ts` to allow `taxCategory`:

```typescript
export interface InvoiceLine {
  description: string; quantity: number; unitPrice: number; unit?: string;
  taxCategory?: string;
}
```

- [ ] **Step 4: Run enforcement tests**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing test for PDF reverse charge notice**

Add to `website/src/lib/invoice-pdf.test.ts`:

```typescript
it('includes reverse charge notice when supplyType is eu_b2b_services', async () => {
  const { generateInvoicePdf } = await import('./invoice-pdf');
  const baseInvoice = {
    id: 'inv-rc', brand: 'test', number: 'RE-2026-0099',
    status: 'open', customerId: 'c1',
    issueDate: '2026-04-28', dueDate: '2026-05-12',
    taxMode: 'regelbesteuerung', netAmount: 500, taxRate: 0,
    taxAmount: 0, grossAmount: 500, locked: true,
    currency: 'EUR', currencyRate: null,
    netAmountEur: 500, grossAmountEur: 500,
    supplyType: 'eu_b2b_services',
  };
  const baseSeller = {
    name: 'Test GmbH', address: 'Musterstr 1', postalCode: '10115',
    city: 'Berlin', country: 'DE', vatId: 'DE123456789',
    taxNumber: '12/345/67890', iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX', bankName: 'Commerzbank',
  };
  const pdf = await generateInvoicePdf({
    invoice: baseInvoice as any,
    lines: [{ description: 'Consulting', quantity: 1, unitPrice: 500, netAmount: 500 }],
    customer: { name: 'Acme SA', email: 'acme@fr.com', country: 'FR', vatNumber: 'FR12345678901' },
    seller: baseSeller,
  });
  // PDF is binary; extract text via toString and check notice substring
  const text = pdf.toString('latin1');
  expect(text).toContain('13b');
});
```

- [ ] **Step 6: Run to verify failure**

```bash
cd website && npx vitest run src/lib/invoice-pdf.test.ts
```

Expected: FAIL.

- [ ] **Step 7: Add supply-type notices in `invoice-pdf.ts`**

In `generateInvoicePdf`, find the block starting with `// ── Legal + payment ref` (around line 241). Replace:

```typescript
    if (isKlein) {
      doc.font('Helvetica').fontSize(7.5).fillColor(C.inkMute)
         .text(kleinNote, L, y, { width: W });
      y = doc.y + 6;
    } else if (seller.vatId) {
      doc.font('Helvetica').fontSize(7.5).fillColor(C.inkMute)
         .text(`USt-IdNr.: ${seller.vatId}`, L, y);
      y = doc.y + 6;
    }
```

with:

```typescript
    if (isKlein) {
      doc.font('Helvetica').fontSize(7.5).fillColor(C.inkMute)
         .text(kleinNote, L, y, { width: W });
      y = doc.y + 6;
    } else {
      if (seller.vatId) {
        doc.font('Helvetica').fontSize(7.5).fillColor(C.inkMute)
           .text(`USt-IdNr.: ${seller.vatId}`, L, y);
        y = doc.y + 4;
      }
      const supplyType = (inv as any).supplyType as string | undefined;
      if (supplyType === 'eu_b2b_services') {
        doc.font('Helvetica').fontSize(7.5).fillColor(C.inkMute)
           .text(
             'Die Steuerschuldnerschaft geht auf den Leistungsempfänger über (§ 13b UStG / Art. 196 MwStSystRL).',
             L, y, { width: W });
        y = doc.y + 4;
      } else if (supplyType === 'eu_b2b_goods') {
        doc.font('Helvetica').fontSize(7.5).fillColor(C.inkMute)
           .text(
             'Steuerfreie innergemeinschaftliche Lieferung gem. § 4 Nr. 1b UStG. Gelangensbestätigung liegt vor.',
             L, y, { width: W });
        y = doc.y + 4;
      } else if (supplyType === 'drittland_export') {
        doc.font('Helvetica').fontSize(7.5).fillColor(C.inkMute)
           .text(
             'Steuerfreie Ausfuhrlieferung gem. § 4 Nr. 1a UStG. Ausfuhrnachweis wird geführt.',
             L, y, { width: W });
        y = doc.y + 4;
      }
    }
```

- [ ] **Step 8: Run all PDF tests**

```bash
cd website && npx vitest run src/lib/invoice-pdf.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add website/src/lib/native-billing.ts website/src/lib/invoice-pdf.ts \
        website/src/lib/native-billing.test.ts website/src/lib/invoice-pdf.test.ts
git commit -m "feat(billing): reverse charge enforcement, buyer vatId required, PDF §13b notice"
```

---

## Task 8: EU B2B Goods Nachweis Tracking (#13)

**Files:**
- Create: `website/src/lib/supply-nachweis.ts`
- Create: `website/src/lib/supply-nachweis.test.ts`

- [ ] **Step 1: Write failing tests**

Create `website/src/lib/supply-nachweis.test.ts`:

```typescript
import { it, expect, beforeAll } from 'vitest';
import { addNachweis, listNachweis, NachweisType } from './supply-nachweis';
import { initBillingTables, createCustomer, createInvoice } from './native-billing';

let invoiceId: string;

beforeAll(async () => {
  await initBillingTables();
  const c = await createCustomer({ brand: 'test', name: 'EU Käufer', email: `eu-${Date.now()}@test.de`, vatNumber: 'FR12345678901' });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 30,
    taxMode: 'regelbesteuerung', taxRate: 0,
    supplyType: 'eu_b2b_goods',
    lines: [{ description: 'Ware', quantity: 10, unitPrice: 50 }],
  });
  invoiceId = inv.id;
});

it('adds and lists a Gelangensbestätigung', async () => {
  const n = await addNachweis({
    invoiceId,
    brand: 'test',
    type: NachweisType.Gelangensbestaetigung,
    receivedAt: '2026-05-10',
    documentRef: 'GB-2026-001',
  });
  expect(n.id).toBeGreaterThan(0);
  expect(n.type).toBe('gelangensbestaetigung');

  const list = await listNachweis(invoiceId);
  expect(list).toHaveLength(1);
  expect(list[0].documentRef).toBe('GB-2026-001');
});

it('adds an Ausfuhrnachweis', async () => {
  const n = await addNachweis({
    invoiceId,
    brand: 'test',
    type: NachweisType.AtlasAusfuhr,
    receivedAt: '2026-05-11',
    documentRef: 'ATLAS-12345678',
    notes: 'Ausgangsvermerk erhalten',
  });
  expect(n.type).toBe('atlas_ausfuhr');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd website && npx vitest run src/lib/supply-nachweis.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `supply-nachweis.ts`**

```typescript
import { pool, initBillingTables } from './website-db';

export enum NachweisType {
  Gelangensbestaetigung = 'gelangensbestaetigung',
  CmrFrachtbrief        = 'cmr_frachtbrief',
  SpediteursErklaerung  = 'spediteurserklaerung',
  AtlasAusfuhr          = 'atlas_ausfuhr',
  AlternativNachweis    = 'alternativ_nachweis',
}

export interface Nachweis {
  id: number; invoiceId: string; brand: string;
  type: string; receivedAt?: string; documentRef?: string;
  notes?: string; createdAt: string;
}

export async function addNachweis(p: {
  invoiceId: string; brand: string; type: NachweisType | string;
  receivedAt?: string; documentRef?: string; notes?: string;
}): Promise<Nachweis> {
  await initBillingTables();
  const r = await pool.query(
    `INSERT INTO billing_nachweis (invoice_id, brand, type, received_at, document_ref, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [p.invoiceId, p.brand, p.type, p.receivedAt ?? null, p.documentRef ?? null, p.notes ?? null],
  );
  return mapNachweis(r.rows[0]);
}

export async function listNachweis(invoiceId: string): Promise<Nachweis[]> {
  await initBillingTables();
  const r = await pool.query(
    `SELECT * FROM billing_nachweis WHERE invoice_id=$1 ORDER BY created_at`,
    [invoiceId],
  );
  return r.rows.map(mapNachweis);
}

function mapNachweis(row: Record<string, unknown>): Nachweis {
  const toDate = (v: unknown) => v ? (v as Date).toISOString().split('T')[0] : undefined;
  return {
    id: Number(row.id), invoiceId: row.invoice_id as string,
    brand: row.brand as string, type: row.type as string,
    receivedAt: toDate(row.received_at),
    documentRef: (row.document_ref as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd website && npx vitest run src/lib/supply-nachweis.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/supply-nachweis.ts website/src/lib/supply-nachweis.test.ts
git commit -m "feat(billing): Nachweis tracking for EU supply (Gelangensbestätigung) and Ausfuhr"
```

---

## Task 9: UStVA KZ 41/43 and ZM Reporting (#12, #13, #14)

**Files:**
- Modify: `website/src/lib/tax-monitor.ts`
- Modify: `website/src/lib/tax-monitor.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `website/src/lib/tax-monitor.test.ts`:

```typescript
import { createCustomer, createInvoice, finalizeInvoice, initBillingTables } from './native-billing';
import { getUstvaExport, getZmEntries } from './tax-monitor';

it('getUstvaExport returns kz41 for eu_b2b_goods and kz43 for drittland_export', async () => {
  await initBillingTables();
  const c1 = await createCustomer({ brand: 'test', name: 'EU B', email: `eub-${Date.now()}@test.eu`, vatNumber: 'FR12345678901' });
  const c2 = await createCustomer({ brand: 'test', name: 'US', email: `us-${Date.now()}@test.us` });

  const inv1 = await createInvoice({
    brand: 'test', customerId: c1.id,
    issueDate: '2026-04-10', dueDays: 30,
    taxMode: 'regelbesteuerung', taxRate: 0,
    supplyType: 'eu_b2b_goods',
    lines: [{ description: 'Ware EU', quantity: 1, unitPrice: 1000 }],
  });
  await finalizeInvoice(inv1.id, { actor: { userId: 'u', email: 'u@t.de' } });

  const inv2 = await createInvoice({
    brand: 'test', customerId: c2.id,
    issueDate: '2026-04-11', dueDays: 30,
    taxMode: 'regelbesteuerung', taxRate: 0,
    supplyType: 'drittland_export',
    lines: [{ description: 'Export US', quantity: 1, unitPrice: 2000 }],
  });
  await finalizeInvoice(inv2.id, { actor: { userId: 'u', email: 'u@t.de' } });

  const ustva = await getUstvaExport('test', 2026, 2);
  expect(ustva.kz41).toBeGreaterThanOrEqual(1000);
  expect(ustva.kz43).toBeGreaterThanOrEqual(2000);
});

it('getZmEntries returns AE and eu_b2b_goods invoices for the quarter', async () => {
  await initBillingTables();
  const c = await createCustomer({ brand: 'test', name: 'ZM Corp', email: `zm-${Date.now()}@test.fr`, vatNumber: 'FR99999999999' });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-20', dueDays: 30,
    taxMode: 'regelbesteuerung', taxRate: 0,
    supplyType: 'eu_b2b_services',
    lines: [{ description: 'Service EU', quantity: 1, unitPrice: 800, taxCategory: 'AE' }],
  });
  await finalizeInvoice(inv.id, { actor: { userId: 'u', email: 'u@t.de' } });

  const entries = await getZmEntries('test', 2026, 2);
  const entry = entries.find(e => e.invoiceId === inv.id);
  expect(entry).toBeDefined();
  expect(entry!.buyerVatId).toBe('FR99999999999');
  expect(entry!.supplyType).toBe('eu_b2b_services');
  expect(entry!.netAmountEur).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd website && npx vitest run src/lib/tax-monitor.test.ts
```

Expected: FAIL — `kz41`/`kz43` not in return type, `getZmEntries` not exported.

- [ ] **Step 3: Extend `getUstvaExport` return type and implementation in `tax-monitor.ts`**

Replace the existing `getUstvaExport` function (lines 88–118) with:

```typescript
export async function getUstvaExport(brand: string, year: number, quarter?: number): Promise<{
  period: string; taxMode: string;
  revenue0: number; revenue7: number; revenue19: number;
  tax7: number; tax19: number; totalTax: number;
  kz41: number;
  kz43: number;
}> {
  const monthRange = quarter
    ? { start: (quarter-1)*3+1, end: quarter*3 }
    : { start: 1, end: 12 };
  const r = await pool.query(
    `SELECT tax_rate, supply_type, SUM(net_amount_eur) AS net, SUM(tax_amount) AS tax
     FROM billing_invoices
     WHERE brand=$1 AND EXTRACT(YEAR FROM issue_date)=$2
       AND EXTRACT(MONTH FROM issue_date) BETWEEN $3 AND $4
       AND status IN ('open','paid')
     GROUP BY tax_rate, supply_type`,
    [brand, year, monthRange.start, monthRange.end]
  );
  const period = quarter ? `Q${quarter}/${year}` : `${year}`;
  const byRate: Record<string, { net: number; tax: number }> = {};
  let kz41 = 0, kz43 = 0;
  for (const row of r.rows) {
    const rate = String(row.tax_rate);
    const st   = row.supply_type as string | null;
    const net  = Number(row.net);
    const tax  = Number(row.tax);
    if (st === 'eu_b2b_goods')      { kz41 += net; continue; }
    if (st === 'drittland_export')  { kz43 += net; continue; }
    const b = byRate[rate] ?? { net: 0, tax: 0 };
    b.net += net; b.tax += tax;
    byRate[rate] = b;
  }
  return {
    period,
    taxMode: await getTaxMode(brand),
    revenue0:  byRate['0']?.net  ?? 0,
    revenue7:  byRate['7']?.net  ?? 0,
    revenue19: byRate['19']?.net ?? 0,
    tax7:   byRate['7']?.tax  ?? 0,
    tax19:  byRate['19']?.tax ?? 0,
    totalTax: (byRate['7']?.tax ?? 0) + (byRate['19']?.tax ?? 0),
    kz41: Math.round(kz41 * 100) / 100,
    kz43: Math.round(kz43 * 100) / 100,
  };
}
```

- [ ] **Step 4: Add `getZmEntries` to `tax-monitor.ts`**

After the closing brace of `getUstvaExport`, add:

```typescript
export interface ZmEntry {
  invoiceId: string;
  invoiceNumber: string;
  issueDate: string;
  buyerVatId: string;
  supplyType: string;
  netAmountEur: number;
}

export async function getZmEntries(brand: string, year: number, quarter: number): Promise<ZmEntry[]> {
  const monthStart = (quarter-1)*3+1;
  const monthEnd   = quarter*3;
  const r = await pool.query(
    `SELECT i.id, i.number, i.issue_date, i.supply_type,
            COALESCE(i.net_amount_eur, i.net_amount) AS net_eur,
            c.vat_number
     FROM billing_invoices i
     JOIN billing_customers c ON c.id = i.customer_id
     WHERE i.brand=$1
       AND EXTRACT(YEAR FROM i.issue_date)=$2
       AND EXTRACT(MONTH FROM i.issue_date) BETWEEN $3 AND $4
       AND i.status IN ('open','paid')
       AND i.supply_type IN ('eu_b2b_services','eu_b2b_goods')
       AND c.vat_number IS NOT NULL
     ORDER BY i.issue_date`,
    [brand, year, monthStart, monthEnd],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    invoiceId:     row.id as string,
    invoiceNumber: row.number as string,
    issueDate:     (row.issue_date as Date).toISOString().split('T')[0],
    buyerVatId:    row.vat_number as string,
    supplyType:    row.supply_type as string,
    netAmountEur:  Number(row.net_eur),
  }));
}
```

- [ ] **Step 5: Run all tax-monitor tests**

```bash
cd website && npx vitest run src/lib/tax-monitor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/tax-monitor.ts website/src/lib/tax-monitor.test.ts
git commit -m "feat(billing): UStVA KZ 41/43 + ZM entry extraction for EU B2B and export invoices"
```

---

## Task 10: Drittland Export Supply Type + Bookings (#14)

**Files:**
- Modify: `website/src/lib/native-billing.test.ts` (drittland round-trip)
- Modify: `website/src/lib/invoice-payments.test.ts` (SKR 8120 booking)

- [ ] **Step 1: Write failing tests**

Add to `website/src/lib/native-billing.test.ts`:

```typescript
it('createInvoice with drittland_export supply type persists correctly', async () => {
  const c = await createCustomer({ brand: 'test', name: 'US Corp', email: `dritt-${Date.now()}@us.com` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 30,
    taxMode: 'regelbesteuerung', taxRate: 0,
    supplyType: 'drittland_export',
    lines: [{ description: 'Export Ware', quantity: 5, unitPrice: 200 }],
  });
  expect(inv.supplyType).toBe('drittland_export');
  expect(inv.netAmount).toBe(1000);
  expect(inv.taxAmount).toBe(0);
});
```

Add to `website/src/lib/invoice-payments.test.ts`:

```typescript
it('payment on drittland_export invoice uses SKR 8120', async () => {
  const c = await createCustomer({ brand: 'test', name: 'Export Corp', email: `exp-${Date.now()}@us.com` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 30,
    taxMode: 'regelbesteuerung', taxRate: 0,
    supplyType: 'drittland_export',
    lines: [{ description: 'Export Ware', quantity: 1, unitPrice: 500 }],
  });
  await finalizeInvoice(inv.id, { actor: { userId: 'u', email: 'u@t.de' } });
  await recordPayment({ invoiceId: inv.id, paidAt: '2026-05-01', amount: 500, method: 'bank', recordedBy: 'admin' });

  const booking = await pool.query(
    `SELECT skr_konto, category FROM eur_bookings WHERE invoice_id=$1 AND type='income'`,
    [inv.id],
  );
  expect(booking.rows[0].skr_konto).toBe('8120');
  expect(booking.rows[0].category).toBe('drittland_export');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts src/lib/invoice-payments.test.ts
```

Expected: FAIL — SKR 8120 not routed, category not set.

- [ ] **Step 3: Propagate supply type to EÜR booking in `invoice-payments.ts`**

In `recordPayment`, the `addBooking` call uses `category: 'zahlungseingang'`. Replace the category logic to use supply_type when present:

```typescript
    const supplyCategory = (inv.supply_type as string | null);
    const incomeCategory = supplyCategory && supplyCategory !== 'eu_b2b_services'
      ? supplyCategory
      : (p.amount < 0 ? 'zahlungseingang_korrektur' : 'zahlungseingang');

    await addBooking({
      brand:       inv.brand,
      bookingDate: p.paidAt,
      type:        'income',
      category:    incomeCategory,
      description: p.amount < 0
        ? `Zahlungskorrektur ${inv.number}`
        : `Zahlungseingang ${inv.number}`,
      netAmount:   eurNet,
      vatAmount:   eurVat,
      invoiceId:   p.invoiceId,
      belegnummer: inv.number,
      taxMode:     inv.tax_mode,
    });
```

The `skrAccountFor` in `skr.ts` already maps `drittland_export` → `8120` (Task 2), so the SKR is automatically correct.

- [ ] **Step 4: Run tests**

```bash
cd website && npx vitest run src/lib/invoice-payments.test.ts src/lib/native-billing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd website && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/invoice-payments.ts website/src/lib/native-billing.test.ts website/src/lib/invoice-payments.test.ts
git commit -m "feat(billing): drittland_export supply type routes to SKR 8120 on payment"
```

---

## Task 11: Verify build + commit + open PR

- [ ] **Step 1: Full vitest sweep**

```bash
cd website && npx vitest run
```

Expected: PASS.

- [ ] **Step 2: Astro build**

```bash
cd website && npm run build
```

Expected: BUILD SUCCESS.

- [ ] **Step 3: Push + PR + auto-merge per project workflow**

```bash
git push -u origin feature/b2b-tax-edge-cases
gh pr create --title "feat(billing): B2B tax edge cases (Plan F)" --body "$(cat <<'EOF'
## Summary
- adds billing schema support for `currency`, `currency_rate`, `net_amount_eur`, `gross_amount_eur`, `supply_type`, `billing_nachweis`, and `vat_id_validations`
- adds ECB exchange-rate lookup and stores EUR-equivalent amounts at invoice creation time
- adds VIES VAT-ID validation logging for EU B2B reverse-charge workflows
- adds reverse-charge, EU-goods, and export supply handling across invoice creation, PDF notices, UStVA export, and ZM reporting
- adds Kursdifferenz handling on payment and routes export / FX edge cases to the correct SKR accounts

Implements Plan F of the billing compliance series and closes the remaining B2B tax edge cases for §13b reverse charge, intra-community goods, Drittland export, and foreign-currency invoices.

## Test plan
- [ ] `cd website && npx vitest run`
- [ ] `cd website && npm run build`
- [ ] Manual: create AE invoice with EU customer VAT ID and confirm PDF contains §13b notice
- [ ] Manual: create `eu_b2b_goods` invoice and confirm `getUstvaExport(...).kz41` and `getZmEntries(...)` include it
- [ ] Manual: create `drittland_export` invoice and confirm `getUstvaExport(...).kz43` includes it
- [ ] Manual: create USD invoice, record payment with a different FX rate, and confirm Kursdifferenz booking in `eur_bookings`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

### Spec coverage

| # | Feature | Covered by |
|---|---|---|
| #12 | reverse_charge tax mode | Tasks 7, 9 (supply_type='eu_b2b_services') |
| #12 | mandatory PDF notice | Task 7 (§13b UStG notice in invoice-pdf.ts) |
| #12 | USt-IdNr validation (BZSt qualif.) | Task 6 (vat-id-validation.ts, VIES POST) |
| #12 | ZM trigger | Task 9 (getZmEntries) |
| #13 | tax-free handling EU B2B | Task 8 (supply_type='eu_b2b_goods', SKR 8338 via Task 2) |
| #13 | Nachweis tracking | Task 8 (supply-nachweis.ts, billing_nachweis table) |
| #13 | KZ 41 UStVA mapping | Task 9 (kz41 in getUstvaExport) |
| #14 | Ausfuhrnachweis workflow | Task 8 (NachweisType.AtlasAusfuhr in supply-nachweis.ts) |
| #14 | KZ 43 mapping | Task 9 (kz43 in getUstvaExport) |
| #16 | currency column | Tasks 1, 4 |
| #16 | EZB exchange-rate lookup | Task 3 (ecb-exchange-rates.ts) |
| #16 | Kursdifferenz booking on payment | Task 5 |

### Placeholder scan

None found — every step contains actual code.

### Type consistency

- `Invoice.supplyType` defined Task 4, used Tasks 7 (pdf), 9 (ustva/zm), 10 (payments) ✓
- `Invoice.currency` / `currencyRate` defined Task 4, used Task 5 ✓
- `NachweisType` enum defined Task 8, used in same task ✓
- `ZmEntry` defined Task 9, returned by `getZmEntries` Task 9 ✓
- `skrAccountFor` extended Task 2, used by Tasks 5 (2668), 10 (8120) via `addBooking` ✓
- `getUstvaExport` extended Task 9 — existing callers get additional `kz41`/`kz43` fields (additive, backwards-compatible) ✓
