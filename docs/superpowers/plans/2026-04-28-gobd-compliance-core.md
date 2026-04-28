# GoBD Compliance Core — Plan A

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. This plan is part of an 8-plan series for billing compliance gaps; see project memory for the breakdown (Plans B–H).

**Goal:** Make every finalized invoice tamper-evident and provably immutable, give every status transition a recorded actor, persist the PDF inside Postgres as the GoBD archive of record, and bring `eur_bookings` up to GoBD-required field set (`belegnummer`, `skr_konto`).

**Architecture:** All schema changes are additive on the existing `billing_invoices` / `eur_bookings` tables plus one new `billing_audit_log` table. `finalizeInvoice()` and `markInvoicePaid()` get an `actor` parameter and write an audit row on every transition. Hashing is computed from a canonical JSON of the invoice + sorted line items, stored in `hash_sha256`, and verifiable at read time. PDFs are persisted as `BYTEA` in Postgres (not MinIO/Nextcloud — thesis-scale volumes don't justify a new service; see plan dialogue). Two Postgres triggers enforce immutability of locked invoices.

**Tech Stack:** TypeScript, Astro endpoints, `pg` pool from `website-db.ts`, Node `crypto.createHash` for SHA-256, vitest for unit tests. No new dependencies.

**Out of scope (explicitly):** dunning/Mahnwesen (Plan B), Storno API (Plan B), partial payments (Plan B), ELSTER/ERiC (Plan D), DATEV (Plan E), XRechnung/PDF-A3 embedding (Plan C), Nextcloud mirror (deferred).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `website/src/lib/website-db.ts` | modify | Add ALTER columns inside `initBillingTables()`/`initEurTables()`; new `initBillingAuditTable()`; add `installInvoiceImmutabilityTriggers()` |
| `website/src/lib/invoice-hash.ts` | create | `canonicalInvoiceForHash(invoice, lines)` + `sha256Hex(string)` + `verifyInvoiceIntegrity(id)` |
| `website/src/lib/invoice-hash.test.ts` | create | Determinism, field-order-invariance, line-order-by-id sort |
| `website/src/lib/billing-audit.ts` | create | `logBillingEvent({ invoiceId, action, actor, fromStatus, toStatus, reason, metadata })`, `getBillingAuditLog(invoiceId)` |
| `website/src/lib/billing-audit.test.ts` | create | Insert + retrieve, timestamp ordering |
| `website/src/lib/skr.ts` | create | `skrAccountFor({ taxMode, category, type })` returning SKR03 numeric string |
| `website/src/lib/skr.test.ts` | create | Mapping coverage for the categories addBooking actually emits |
| `website/src/lib/native-billing.ts` | modify | `finalizeInvoice(id, opts?)` + `markInvoicePaid(id, p, actor?)`; compute hash, persist PDF, write audit row |
| `website/src/lib/native-billing.test.ts` | modify | Cover new finalize/markPaid signatures, hash population, audit row creation |
| `website/src/lib/eur-bookkeeping.ts` | modify | `addBooking()` populates `belegnummer` + `skr_konto`; backfill helper `backfillEurGobdFields()` |
| `website/src/pages/api/admin/billing/[id]/send.ts` | modify | Pass session user as actor; pass generated PDF buffer to `finalizeInvoice` |
| `website/src/pages/api/billing/invoice/[id]/pdf.ts` | create | `GET` serves stored `pdf_blob` (admin-only or invoice owner) |
| `website/src/pages/api/admin/billing/integrity-check.ts` | create | Audit all locked invoices, return mismatches |

---

## Task 1: Schema migration — additive columns and audit table

**Files:**
- Modify: `website/src/lib/website-db.ts:3027` (billing_invoices), `:3128` (eur_bookings); add new `initBillingAuditTable()`

- [ ] **Step 1: Extend `initBillingTables()` to ALTER existing columns**

After the `CREATE TABLE IF NOT EXISTS billing_invoices …` block, append:

```ts
  await pool.query(`
    ALTER TABLE billing_invoices
      ADD COLUMN IF NOT EXISTS hash_sha256    TEXT,
      ADD COLUMN IF NOT EXISTS pdf_blob       BYTEA,
      ADD COLUMN IF NOT EXISTS pdf_mime       TEXT,
      ADD COLUMN IF NOT EXISTS pdf_size_bytes INTEGER,
      ADD COLUMN IF NOT EXISTS finalized_at   TIMESTAMPTZ
  `);
```

- [ ] **Step 2: Extend `initEurTables()` likewise**

After the `CREATE TABLE IF NOT EXISTS eur_bookings …` block:

```ts
  await pool.query(`
    ALTER TABLE eur_bookings
      ADD COLUMN IF NOT EXISTS belegnummer TEXT,
      ADD COLUMN IF NOT EXISTS skr_konto   TEXT
  `);
```

- [ ] **Step 3: Add `initBillingAuditTable()` and call it from `initBillingTables()`**

```ts
async function initBillingAuditTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_audit_log (
      id            BIGSERIAL PRIMARY KEY,
      invoice_id    TEXT NOT NULL REFERENCES billing_invoices(id),
      action        TEXT NOT NULL,
      actor_user_id TEXT,
      actor_email   TEXT,
      from_status   TEXT,
      to_status     TEXT,
      reason        TEXT,
      metadata      JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_audit_invoice ON billing_audit_log(invoice_id, created_at DESC)`);
}
```

Inside `initBillingTables()`, after the existing CREATEs and before `billingTablesReady = true;`, call `await initBillingAuditTable();`.

- [ ] **Step 4: Run vitest to confirm idempotency**

```bash
cd website && SESSIONS_DATABASE_URL=$SESSIONS_DATABASE_URL npx vitest run src/lib/native-billing.test.ts
```
Expected: existing 2 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(billing): add GoBD schema columns + billing_audit_log table"
```

---

## Task 2: Hash library + canonicalization

**Files:**
- Create: `website/src/lib/invoice-hash.ts`, `website/src/lib/invoice-hash.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// invoice-hash.test.ts
import { describe, it, expect } from 'vitest';
import { canonicalInvoiceForHash, sha256Hex } from './invoice-hash';

const inv = {
  id: 'i1', number: 'RE-2026-0001', brand: 'mentolder',
  customerId: 'c1', issueDate: '2026-04-01', dueDate: '2026-04-15',
  taxMode: 'regelbesteuerung', netAmount: 100, taxRate: 19, taxAmount: 19, grossAmount: 119,
};
const lines = [
  { id: 2, description: 'B', quantity: 1, unitPrice: 50, netAmount: 50 },
  { id: 1, description: 'A', quantity: 1, unitPrice: 50, netAmount: 50 },
];

describe('canonicalInvoiceForHash', () => {
  it('produces identical hash regardless of line input order', () => {
    const a = sha256Hex(canonicalInvoiceForHash(inv, lines));
    const b = sha256Hex(canonicalInvoiceForHash(inv, [...lines].reverse()));
    expect(a).toBe(b);
  });
  it('changes when an amount changes', () => {
    const a = sha256Hex(canonicalInvoiceForHash(inv, lines));
    const b = sha256Hex(canonicalInvoiceForHash({ ...inv, netAmount: 101 }, lines));
    expect(a).not.toBe(b);
  });
  it('produces 64-hex-char digest', () => {
    expect(sha256Hex('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// invoice-hash.ts
import { createHash } from 'node:crypto';
import { pool } from './website-db';

export interface HashableInvoice {
  id: string; number: string; brand: string; customerId: string;
  issueDate: string; dueDate: string;
  taxMode: string; netAmount: number; taxRate: number; taxAmount: number; grossAmount: number;
  servicePeriodStart?: string; servicePeriodEnd?: string;
}
export interface HashableLine {
  id: number; description: string; quantity: number; unitPrice: number; netAmount: number; unit?: string;
}

export function canonicalInvoiceForHash(inv: HashableInvoice, lines: HashableLine[]): string {
  const sortedLines = [...lines].sort((a, b) => a.id - b.id).map(l => ({
    id: l.id, description: l.description,
    quantity: Number(l.quantity), unitPrice: Number(l.unitPrice),
    netAmount: Number(l.netAmount), unit: l.unit ?? null,
  }));
  const payload = {
    id: inv.id, number: inv.number, brand: inv.brand, customerId: inv.customerId,
    issueDate: inv.issueDate, dueDate: inv.dueDate,
    servicePeriodStart: inv.servicePeriodStart ?? null,
    servicePeriodEnd: inv.servicePeriodEnd ?? null,
    taxMode: inv.taxMode,
    netAmount: Number(inv.netAmount), taxRate: Number(inv.taxRate),
    taxAmount: Number(inv.taxAmount), grossAmount: Number(inv.grossAmount),
    lines: sortedLines,
  };
  return JSON.stringify(payload, Object.keys(payload).sort());
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export interface IntegrityResult {
  invoiceId: string; ok: boolean;
  storedHash: string | null; expectedHash: string;
}

export async function verifyInvoiceIntegrity(invoiceId: string): Promise<IntegrityResult | null> {
  const invR = await pool.query(`SELECT * FROM billing_invoices WHERE id=$1`, [invoiceId]);
  const row = invR.rows[0];
  if (!row) return null;
  const linesR = await pool.query(
    `SELECT id, description, quantity, unit_price, net_amount, unit
     FROM billing_invoice_line_items WHERE invoice_id=$1 ORDER BY id`, [invoiceId]
  );
  const inv: HashableInvoice = {
    id: row.id, number: row.number, brand: row.brand, customerId: row.customer_id,
    issueDate: (row.issue_date as Date).toISOString().split('T')[0],
    dueDate:   (row.due_date as Date).toISOString().split('T')[0],
    servicePeriodStart: row.service_period_start
      ? (row.service_period_start as Date).toISOString().split('T')[0] : undefined,
    servicePeriodEnd: row.service_period_end
      ? (row.service_period_end as Date).toISOString().split('T')[0] : undefined,
    taxMode: row.tax_mode, netAmount: Number(row.net_amount),
    taxRate: Number(row.tax_rate), taxAmount: Number(row.tax_amount),
    grossAmount: Number(row.gross_amount),
  };
  const lines: HashableLine[] = linesR.rows.map(l => ({
    id: Number(l.id), description: l.description as string,
    quantity: Number(l.quantity), unitPrice: Number(l.unit_price),
    netAmount: Number(l.net_amount), unit: (l.unit as string) ?? undefined,
  }));
  const expected = sha256Hex(canonicalInvoiceForHash(inv, lines));
  return {
    invoiceId, expectedHash: expected,
    storedHash: row.hash_sha256 ?? null,
    ok: row.hash_sha256 === expected,
  };
}
```

- [ ] **Step 3: Run tests, expect pass**

```bash
cd website && npx vitest run src/lib/invoice-hash.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/invoice-hash.ts website/src/lib/invoice-hash.test.ts
git commit -m "feat(billing): canonical invoice hashing + integrity verification"
```

---

## Task 3: Audit log helper

**Files:**
- Create: `website/src/lib/billing-audit.ts`, `website/src/lib/billing-audit.test.ts`

- [ ] **Step 1: Test**

```ts
// billing-audit.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { initBillingTables, createCustomer, createInvoice } from './native-billing';
import { logBillingEvent, getBillingAuditLog } from './billing-audit';

beforeAll(async () => { await initBillingTables(); });

describe('billing-audit', () => {
  it('records and retrieves events in reverse-chrono order', async () => {
    const c = await createCustomer({ brand: 'audit', name: 'X', email: `audit-${Date.now()}@t.de` });
    const inv = await createInvoice({
      brand: 'audit', customerId: c.id, issueDate: '2026-04-01', dueDays: 14,
      taxMode: 'kleinunternehmer', lines: [{ description: 'L', quantity: 1, unitPrice: 10 }],
    });
    await logBillingEvent({ invoiceId: inv.id, action: 'create', actor: { userId: 'u1', email: 'u1@t.de' }, toStatus: 'draft' });
    await logBillingEvent({ invoiceId: inv.id, action: 'finalize', actor: { userId: 'u1', email: 'u1@t.de' }, fromStatus: 'draft', toStatus: 'open' });
    const log = await getBillingAuditLog(inv.id);
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log[0].action).toBe('finalize');
    expect(log[1].action).toBe('create');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// billing-audit.ts
import { pool } from './website-db';

export interface BillingActor { userId?: string; email?: string }
export interface BillingAuditEntry {
  id: number; invoiceId: string; action: string;
  actorUserId?: string; actorEmail?: string;
  fromStatus?: string; toStatus?: string;
  reason?: string; metadata?: Record<string, unknown>;
  createdAt: string;
}

export async function logBillingEvent(p: {
  invoiceId: string; action: string; actor?: BillingActor;
  fromStatus?: string; toStatus?: string; reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO billing_audit_log
       (invoice_id, action, actor_user_id, actor_email, from_status, to_status, reason, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [p.invoiceId, p.action, p.actor?.userId ?? null, p.actor?.email ?? null,
     p.fromStatus ?? null, p.toStatus ?? null, p.reason ?? null,
     p.metadata ? JSON.stringify(p.metadata) : null]
  );
}

export async function getBillingAuditLog(invoiceId: string): Promise<BillingAuditEntry[]> {
  const r = await pool.query(
    `SELECT * FROM billing_audit_log WHERE invoice_id=$1 ORDER BY created_at DESC, id DESC`, [invoiceId]
  );
  return r.rows.map(row => ({
    id: Number(row.id), invoiceId: row.invoice_id, action: row.action,
    actorUserId: row.actor_user_id ?? undefined, actorEmail: row.actor_email ?? undefined,
    fromStatus: row.from_status ?? undefined, toStatus: row.to_status ?? undefined,
    reason: row.reason ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: (row.created_at as Date).toISOString(),
  }));
}
```

- [ ] **Step 3: Test + commit**

```bash
cd website && npx vitest run src/lib/billing-audit.test.ts
git add website/src/lib/billing-audit.ts website/src/lib/billing-audit.test.ts
git commit -m "feat(billing): audit log helper"
```

---

## Task 4: SKR03 mapping

**Files:** Create `website/src/lib/skr.ts`, `website/src/lib/skr.test.ts`

- [ ] **Step 1: Test**

```ts
// skr.test.ts
import { describe, it, expect } from 'vitest';
import { skrAccountFor } from './skr';

describe('skrAccountFor', () => {
  it('Kleinunternehmer income → 8195', () => {
    expect(skrAccountFor({ taxMode: 'kleinunternehmer', type: 'income', category: 'rechnungsstellung' })).toBe('8195');
  });
  it('Regelbesteuerung income 19% → 8400', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'income', category: 'rechnungsstellung' })).toBe('8400');
  });
  it('expense default → 4980 Sonstiger Betriebsbedarf', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'expense', category: 'misc' })).toBe('4980');
  });
  it('pretax (Vorsteuer) → 1576', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'pretax', category: 'misc' })).toBe('1576');
  });
  it('vat_payment → 1780', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'vat_payment', category: 'ust-vorauszahlung' })).toBe('1780');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// skr.ts
export interface SkrInput {
  taxMode: 'kleinunternehmer' | 'regelbesteuerung' | string;
  type: 'income' | 'expense' | 'pretax' | 'vat_payment' | 'vat_refund' | string;
  category: string;
}

export function skrAccountFor(p: SkrInput): string {
  if (p.type === 'income') {
    return p.taxMode === 'kleinunternehmer' ? '8195' : '8400';
  }
  if (p.type === 'pretax') return '1576';
  if (p.type === 'vat_payment') return '1780';
  if (p.type === 'vat_refund') return '1781';
  return '4980';
}
```

- [ ] **Step 3: Test + commit**

```bash
cd website && npx vitest run src/lib/skr.test.ts
git add website/src/lib/skr.ts website/src/lib/skr.test.ts
git commit -m "feat(billing): SKR03 account mapping"
```

---

## Task 5: Wire hash + audit + PDF persistence into `finalizeInvoice`

**Files:** Modify `website/src/lib/native-billing.ts`, update `website/src/lib/native-billing.test.ts`

- [ ] **Step 1: Extend `finalizeInvoice` signature**

Replace the current function (`native-billing.ts:116-137`) with:

```ts
export interface FinalizeOpts {
  actor?: { userId?: string; email?: string };
  pdfBlob?: Buffer;
  pdfMime?: string;
}

export async function finalizeInvoice(id: string, opts: FinalizeOpts = {}): Promise<Invoice | null> {
  await initBillingTables();
  const { canonicalInvoiceForHash, sha256Hex } = await import('./invoice-hash');
  const { logBillingEvent } = await import('./billing-audit');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE billing_invoices
         SET status='open', locked=true, finalized_at=now(), updated_at=now()
       WHERE id=$1 AND status='draft' RETURNING *`, [id]
    );
    if (!upd.rows[0]) { await client.query('ROLLBACK'); return null; }
    const row = upd.rows[0];
    const linesR = await client.query(
      `SELECT id, description, quantity, unit_price, net_amount, unit
       FROM billing_invoice_line_items WHERE invoice_id=$1 ORDER BY id`, [id]
    );
    const inv = mapInvoice(row);
    const hashable = {
      id: inv.id, number: inv.number, brand: inv.brand, customerId: inv.customerId,
      issueDate: inv.issueDate, dueDate: inv.dueDate,
      servicePeriodStart: inv.servicePeriodStart, servicePeriodEnd: inv.servicePeriodEnd,
      taxMode: inv.taxMode, netAmount: inv.netAmount,
      taxRate: inv.taxRate, taxAmount: inv.taxAmount, grossAmount: inv.grossAmount,
    };
    const lines = linesR.rows.map(l => ({
      id: Number(l.id), description: l.description as string,
      quantity: Number(l.quantity), unitPrice: Number(l.unit_price),
      netAmount: Number(l.net_amount), unit: (l.unit as string) ?? undefined,
    }));
    const hash = sha256Hex(canonicalInvoiceForHash(hashable, lines));
    await client.query(
      `UPDATE billing_invoices
         SET hash_sha256=$2,
             pdf_blob=$3, pdf_mime=$4, pdf_size_bytes=$5
       WHERE id=$1`,
      [id, hash, opts.pdfBlob ?? null, opts.pdfMime ?? (opts.pdfBlob ? 'application/pdf' : null),
       opts.pdfBlob?.length ?? null]
    );
    await client.query('COMMIT');

    await checkAndApplyTaxModeSwitch(inv.brand, id);
    await addBooking({
      brand: inv.brand, bookingDate: inv.issueDate, type: 'income',
      category: 'rechnungsstellung', description: `Rechnung ${inv.number}`,
      netAmount: inv.netAmount, vatAmount: inv.taxAmount, invoiceId: inv.id,
      belegnummer: inv.number, taxMode: inv.taxMode,
    });
    await logBillingEvent({
      invoiceId: id, action: 'finalize', actor: opts.actor,
      fromStatus: 'draft', toStatus: 'open',
      metadata: { hash, pdfBytes: opts.pdfBlob?.length ?? null },
    });
    return inv;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Update existing test, add hash+audit assertions**

In `native-billing.test.ts`, replace the second test:

```ts
import { logBillingEvent as _ } from './billing-audit'; // keep import to verify resolution
import { getBillingAuditLog } from './billing-audit';
import { verifyInvoiceIntegrity } from './invoice-hash';

it('finalize stores hash, persists PDF, writes audit row', async () => {
  const customer = await createCustomer({ brand:'test', name:'Erika M', email:`erika-${Date.now()}@test.de`});
  const inv = await createInvoice({
    brand: 'test', customerId: customer.id,
    issueDate: '2025-09-01', dueDays: 14,
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'Coaching 1h', quantity: 1, unitPrice: 60 }],
  });
  const fakePdf = Buffer.from('%PDF-1.4 stub');
  const finalized = await finalizeInvoice(inv.id, {
    actor: { userId: 'admin1', email: 'admin@t.de' },
    pdfBlob: fakePdf, pdfMime: 'application/pdf',
  });
  expect(finalized!.status).toBe('open');
  expect(finalized!.locked).toBe(true);

  const integrity = await verifyInvoiceIntegrity(inv.id);
  expect(integrity!.ok).toBe(true);
  expect(integrity!.storedHash).toMatch(/^[0-9a-f]{64}$/);

  const audit = await getBillingAuditLog(inv.id);
  expect(audit.find(e => e.action === 'finalize')).toBeTruthy();
  expect(audit.find(e => e.action === 'finalize')!.actorEmail).toBe('admin@t.de');
});
```

- [ ] **Step 3: Run tests + commit**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
git add website/src/lib/native-billing.ts website/src/lib/native-billing.test.ts
git commit -m "feat(billing): hash + audit + PDF persistence on finalize"
```

---

## Task 6: Wire audit into `markInvoicePaid` + populate EÜR fields

**Files:** Modify `website/src/lib/native-billing.ts`, `website/src/lib/eur-bookkeeping.ts`

- [ ] **Step 1: Extend `markInvoicePaid` signature**

```ts
export async function markInvoicePaid(
  id: string,
  p: { paidAt: string; paidAmount: number },
  actor?: { userId?: string; email?: string }
): Promise<Invoice | null> {
  await initBillingTables();
  const { logBillingEvent } = await import('./billing-audit');
  const r = await pool.query(
    `UPDATE billing_invoices SET status='paid', paid_at=$2, paid_amount=$3, updated_at=now()
     WHERE id=$1 AND status='open' RETURNING *`,
    [id, p.paidAt, p.paidAmount]
  );
  if (!r.rows[0]) return null;
  const inv = mapInvoice(r.rows[0]);
  await logBillingEvent({
    invoiceId: id, action: 'mark_paid', actor,
    fromStatus: 'open', toStatus: 'paid',
    metadata: { paidAt: p.paidAt, paidAmount: p.paidAmount },
  });
  return inv;
}
```

- [ ] **Step 2: Extend `addBooking` to accept + populate `belegnummer`/`skr_konto`**

In `eur-bookkeeping.ts`, replace `addBooking`:

```ts
import { skrAccountFor } from './skr';
// …

export async function addBooking(p: Omit<EurBooking, 'id'> & {
  belegnummer?: string;
  skrKonto?: string;
  taxMode?: string;
}): Promise<EurBooking> {
  await initEurTables();
  const beleg = p.belegnummer ?? (p.invoiceId ? `INV-${p.invoiceId.slice(0,8)}` : `MAN-${Date.now()}`);
  const skr = p.skrKonto ?? skrAccountFor({
    taxMode: p.taxMode ?? 'regelbesteuerung',
    type: p.type, category: p.category,
  });
  const r = await pool.query(
    `INSERT INTO eur_bookings
       (brand,booking_date,type,category,description,net_amount,vat_amount,invoice_id,receipt_path,belegnummer,skr_konto)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [p.brand, p.bookingDate, p.type, p.category, p.description,
     p.netAmount, p.vatAmount, p.invoiceId??null, p.receiptPath??null, beleg, skr]
  );
  return mapBooking(r.rows[0]);
}
```

Also extend `EurBooking` interface and `mapBooking` to surface the new fields.

- [ ] **Step 3: Add tests**

Append to `native-billing.test.ts`:

```ts
import { pool } from './website-db';

it('markInvoicePaid records audit row', async () => {
  const c = await createCustomer({ brand: 'test', name: 'Pay', email: `pay-${Date.now()}@t.de` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id, issueDate: '2025-09-01', dueDays: 14,
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'X', quantity: 1, unitPrice: 10 }],
  });
  await finalizeInvoice(inv.id, { actor: { email: 'a@t.de' } });
  await markInvoicePaid(inv.id, { paidAt: '2025-09-15', paidAmount: 10 }, { email: 'a@t.de' });
  const audit = await getBillingAuditLog(inv.id);
  expect(audit.find(e => e.action === 'mark_paid')).toBeTruthy();

  const eur = await pool.query(
    `SELECT belegnummer, skr_konto FROM eur_bookings WHERE invoice_id=$1`, [inv.id]
  );
  expect(eur.rows[0].belegnummer).toBe(inv.number);
  expect(eur.rows[0].skr_konto).toBe('8195');
});
```

- [ ] **Step 4: Test + commit**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
git add website/src/lib/native-billing.ts website/src/lib/eur-bookkeeping.ts
git commit -m "feat(billing): audit on markPaid + GoBD fields on EÜR bookings"
```

---

## Task 7: Postgres immutability triggers

**Files:** Modify `website/src/lib/website-db.ts`

- [ ] **Step 1: Add `installInvoiceImmutabilityTriggers()` and call from `initBillingTables()`**

```ts
async function installInvoiceImmutabilityTriggers(): Promise<void> {
  await pool.query(`
    CREATE OR REPLACE FUNCTION billing_invoices_immutable() RETURNS trigger AS $$
    BEGIN
      IF OLD.locked = true THEN
        IF NEW.net_amount   IS DISTINCT FROM OLD.net_amount   OR
           NEW.tax_rate     IS DISTINCT FROM OLD.tax_rate     OR
           NEW.tax_amount   IS DISTINCT FROM OLD.tax_amount   OR
           NEW.gross_amount IS DISTINCT FROM OLD.gross_amount OR
           NEW.tax_mode     IS DISTINCT FROM OLD.tax_mode     OR
           NEW.customer_id  IS DISTINCT FROM OLD.customer_id  OR
           NEW.issue_date   IS DISTINCT FROM OLD.issue_date   OR
           NEW.due_date     IS DISTINCT FROM OLD.due_date     OR
           NEW.number       IS DISTINCT FROM OLD.number       OR
           NEW.brand        IS DISTINCT FROM OLD.brand        OR
           NEW.hash_sha256  IS DISTINCT FROM OLD.hash_sha256
        THEN
          RAISE EXCEPTION 'GoBD: locked invoice % cannot be modified', OLD.id;
        END IF;
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION billing_invoices_no_delete() RETURNS trigger AS $$
    BEGIN
      IF OLD.locked = true THEN
        RAISE EXCEPTION 'GoBD: locked invoice % cannot be deleted', OLD.id;
      END IF;
      RETURN OLD;
    END $$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION billing_lines_immutable() RETURNS trigger AS $$
    DECLARE inv_locked boolean;
    BEGIN
      SELECT locked INTO inv_locked FROM billing_invoices
        WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
      IF inv_locked = true THEN
        RAISE EXCEPTION 'GoBD: cannot modify lines of locked invoice %', COALESCE(NEW.invoice_id, OLD.invoice_id);
      END IF;
      RETURN COALESCE(NEW, OLD);
    END $$ LANGUAGE plpgsql;
  `);
  await pool.query(`DROP TRIGGER IF EXISTS billing_invoices_immutable_trg ON billing_invoices`);
  await pool.query(`CREATE TRIGGER billing_invoices_immutable_trg
    BEFORE UPDATE ON billing_invoices
    FOR EACH ROW EXECUTE FUNCTION billing_invoices_immutable()`);
  await pool.query(`DROP TRIGGER IF EXISTS billing_invoices_no_delete_trg ON billing_invoices`);
  await pool.query(`CREATE TRIGGER billing_invoices_no_delete_trg
    BEFORE DELETE ON billing_invoices
    FOR EACH ROW EXECUTE FUNCTION billing_invoices_no_delete()`);
  await pool.query(`DROP TRIGGER IF EXISTS billing_lines_immutable_trg ON billing_invoice_line_items`);
  await pool.query(`CREATE TRIGGER billing_lines_immutable_trg
    BEFORE INSERT OR UPDATE OR DELETE ON billing_invoice_line_items
    FOR EACH ROW EXECUTE FUNCTION billing_lines_immutable()`);
}
```

Call `await installInvoiceImmutabilityTriggers();` at the end of `initBillingTables()` before setting `billingTablesReady = true;`.

- [ ] **Step 2: Add test that triggers raise**

In `native-billing.test.ts`:

```ts
it('rejects mutation of locked invoice line items', async () => {
  const c = await createCustomer({ brand: 'test', name: 'Lock', email: `lock-${Date.now()}@t.de` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id, issueDate: '2025-09-01', dueDays: 14,
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'L', quantity: 1, unitPrice: 10 }],
  });
  await finalizeInvoice(inv.id, { actor: { email: 'a@t.de' } });
  await expect(
    pool.query(`UPDATE billing_invoice_line_items SET unit_price=99 WHERE invoice_id=$1`, [inv.id])
  ).rejects.toThrow(/GoBD/);
  await expect(
    pool.query(`UPDATE billing_invoices SET net_amount=999 WHERE id=$1`, [inv.id])
  ).rejects.toThrow(/GoBD/);
});
```

- [ ] **Step 3: Test + commit**

```bash
cd website && npx vitest run src/lib/native-billing.test.ts
git add website/src/lib/website-db.ts website/src/lib/native-billing.test.ts
git commit -m "feat(billing): postgres triggers enforce GoBD immutability"
```

---

## Task 8: Update `send.ts` route to pass actor + persist PDF

**Files:** Modify `website/src/pages/api/admin/billing/[id]/send.ts:118-125`

- [ ] **Step 1: Replace finalize/zugferd block**

Find:
```ts
  // Finalize (transitions to open+locked — do this after generation)
  const finalized = await finalizeInvoice(id);
  if (!finalized) return new Response('Failed to finalize invoice', { status: 409 });

  // Store ZUGFeRD XML + PDF reference
  await pool.query(
    `UPDATE billing_invoices SET zugferd_xml=$2, updated_at=now() WHERE id=$1`, [id, xml]
  );
```

Replace with:

```ts
  const finalized = await finalizeInvoice(id, {
    actor: { userId: session.userId, email: session.email },
    pdfBlob: pdf, pdfMime: 'application/pdf',
  });
  if (!finalized) return new Response('Failed to finalize invoice', { status: 409 });

  await pool.query(
    `UPDATE billing_invoices SET zugferd_xml=$2 WHERE id=$1`, [id, xml]
  );
```

(`updated_at=now()` removed because the trigger now blocks any post-lock UPDATE that touches financial fields, and `zugferd_xml` itself is allowed since the trigger whitelist permits it. But `updated_at` is fine to bump — it's not in the locked-column whitelist as written. Verify: the trigger only flags fields that are `IS DISTINCT FROM OLD.*` for the listed financial columns, so `updated_at` and `zugferd_xml` both pass freely.)

- [ ] **Step 2: Verify session has userId/email**

Check `getSession()` in `website/src/lib/auth.ts` for fields. If session uses `id` not `userId`, adjust accordingly.

- [ ] **Step 3: Build check + commit**

```bash
cd website && npx astro check 2>&1 | head -30
git add website/src/pages/api/admin/billing/\[id\]/send.ts
git commit -m "feat(billing): send.ts threads actor + persists PDF on finalize"
```

---

## Task 9: PDF retrieval + integrity-check routes

**Files:**
- Create: `website/src/pages/api/billing/invoice/[id]/pdf.ts`
- Create: `website/src/pages/api/admin/billing/integrity-check.ts`

- [ ] **Step 1: PDF route**

```ts
// pdf.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool, initBillingTables } from '../../../../../lib/website-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });
  await initBillingTables();
  const id = params.id as string;
  const r = await pool.query(
    `SELECT i.pdf_blob, i.pdf_mime, i.number, i.customer_id, c.email AS customer_email
       FROM billing_invoices i JOIN billing_customers c ON c.id = i.customer_id
       WHERE i.id=$1`, [id]
  );
  const row = r.rows[0];
  if (!row || !row.pdf_blob) return new Response('Not found', { status: 404 });
  if (!isAdmin(session) && session.email !== row.customer_email) {
    return new Response('Forbidden', { status: 403 });
  }
  return new Response(row.pdf_blob, {
    status: 200,
    headers: {
      'Content-Type': row.pdf_mime || 'application/pdf',
      'Content-Disposition': `attachment; filename="${row.number}.pdf"`,
    },
  });
};
```

- [ ] **Step 2: Integrity-check route**

```ts
// integrity-check.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool, initBillingTables } from '../../../../lib/website-db';
import { verifyInvoiceIntegrity } from '../../../../lib/invoice-hash';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await initBillingTables();
  const ids = await pool.query(`SELECT id FROM billing_invoices WHERE locked=true`);
  const results = await Promise.all(ids.rows.map(r => verifyInvoiceIntegrity(r.id)));
  const mismatches = results.filter(r => r && !r.ok);
  return new Response(JSON.stringify({
    checked: results.length,
    ok: results.length - mismatches.length,
    mismatches: mismatches.map(m => ({ id: m!.invoiceId, expected: m!.expectedHash, stored: m!.storedHash })),
  }), { headers: { 'Content-Type': 'application/json' }});
};
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/billing/invoice/\[id\]/pdf.ts website/src/pages/api/admin/billing/integrity-check.ts
git commit -m "feat(billing): PDF retrieval + integrity-check endpoints"
```

---

## Task 10: Backfill existing rows

**Files:** Create `website/scripts/gobd-backfill.mjs`

- [ ] **Step 1: Backfill script**

```js
#!/usr/bin/env node
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.SESSIONS_DATABASE_URL });

const { rowCount: bn } = await pool.query(`
  UPDATE eur_bookings e
     SET belegnummer = i.number
    FROM billing_invoices i
   WHERE e.invoice_id = i.id AND e.belegnummer IS NULL
`);
console.log(`backfilled belegnummer for ${bn} rows`);

const { rowCount: skr } = await pool.query(`
  UPDATE eur_bookings
     SET skr_konto = CASE
       WHEN type='income' AND EXISTS (
         SELECT 1 FROM billing_invoices i
          WHERE i.id = eur_bookings.invoice_id AND i.tax_mode='kleinunternehmer'
       ) THEN '8195'
       WHEN type='income' THEN '8400'
       WHEN type='pretax' THEN '1576'
       WHEN type='vat_payment' THEN '1780'
       WHEN type='vat_refund' THEN '1781'
       ELSE '4980'
     END
   WHERE skr_konto IS NULL
`);
console.log(`backfilled skr_konto for ${skr} rows`);
await pool.end();
```

- [ ] **Step 2: Run against dev DB to verify, then commit**

```bash
chmod +x website/scripts/gobd-backfill.mjs
SESSIONS_DATABASE_URL=$DEV_DB node website/scripts/gobd-backfill.mjs
git add website/scripts/gobd-backfill.mjs
git commit -m "chore(billing): one-shot GoBD backfill script"
```

---

## Task 11: Verify build + commit + open PR

- [ ] **Step 1: Full vitest sweep**

```bash
cd website && npx vitest run
```

- [ ] **Step 2: Astro build**

```bash
cd website && npm run build
```

- [ ] **Step 3: Push + PR + auto-merge per project workflow**

```bash
git push -u origin feature/gobd-compliance-core
gh pr create --title "feat(billing): GoBD compliance core (Plan A)" --body "$(cat <<'EOF'
## Summary
- Adds `hash_sha256`, `pdf_blob`, `pdf_mime`, `pdf_size_bytes`, `finalized_at` to `billing_invoices`
- Adds `belegnummer`, `skr_konto` to `eur_bookings`
- New `billing_audit_log` table + Postgres triggers blocking mutation/deletion of locked invoices
- `finalizeInvoice()` now computes a canonical SHA-256 over invoice + line items, persists the PDF inline, and writes an audit row with the actor
- `markInvoicePaid()` writes an audit row
- New routes: GET `/api/billing/invoice/[id]/pdf` and admin `/api/admin/billing/integrity-check`

Implements Plan A of the 8-plan compliance series. Plans B–H (dunning, Storno, ZUGFeRD/XRechnung embedding, ELSTER, DATEV, B2B tax edge cases, contact rework, SEPA) follow.

## Test plan
- [ ] vitest `src/lib/invoice-hash.test.ts`, `billing-audit.test.ts`, `skr.test.ts`, `native-billing.test.ts`
- [ ] Manual: finalize an invoice, hit `/api/admin/billing/integrity-check`, confirm `mismatches: []`
- [ ] Manual: download PDF via `/api/billing/invoice/[id]/pdf`
- [ ] Manual: attempt `UPDATE billing_invoices SET net_amount=…` on a locked invoice → trigger raises

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

**Spec coverage** (against the four items Plan A bundles):
- #8 SHA-256/GoBD hash → Task 1 (column) + Task 2 (compute) + Task 5 (wire) + Task 9 (verify route) ✓
- #9 billing audit log → Task 1 (table) + Task 3 (helper) + Task 5/6 (wire) ✓
- #11 EÜR `belegnummer` + `skr_konto` → Task 1 (columns) + Task 4 (mapping) + Task 6 (populate) + Task 10 (backfill) ✓
- #19 PDF archive → Task 1 (column) + Task 5 (persist) + Task 8 (route passes blob) + Task 9 (retrieval) + Task 7 (immutability) ✓

**Type consistency:** `BillingActor` shape (`{ userId?, email? }`) used in Task 3, 5, 6 — consistent. `HashableInvoice` defined in Task 2, consumed in Task 5 — consistent.

**Placeholders:** none.

**Note on session shape (Task 8):** signature assumes `session.userId` / `session.email`. If `getSession()` returns different field names, swap accordingly. Single-line fix; no replan.
