# SEPA pain.008.001.02 Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a SEPA Direct Debit batch file (pain.008.001.02 XML) from open/partially-paid invoices whose customers have stored SEPA mandate data, downloadable via an admin API endpoint.

**Architecture:** Pure TypeScript XML string builder (`sepa-pain008.ts`) with no npm dependency — the pain.008.001.02 schema is small and well-defined. A new admin endpoint (`/api/admin/billing/sepa-export`) queries open invoices, joins with customer mandate data, validates mandates, builds the XML, and returns it as an attachment. Creditor identity (IBAN, BIC, Gläubiger-ID) lives in environment variables.

**Tech Stack:** Astro 5.7 APIRoute, Node.js `pg` pool (existing `website-db.ts` pool), TypeScript, no new npm packages.

---

## Scope Notes

This plan assumes the contact/billing schema work from the adjacent SEPA billing plan is already present on the target branch:
- `billing_customers` already has `sepa_iban`, `sepa_bic`, `sepa_mandate_ref`, `sepa_mandate_date`
- `billing_invoices` already has `status`, `paid_amount`, and `payment_reference`
- `k3d/website.yaml` already mounts the new SEPA creditor env vars into the website container

The endpoint behavior in this plan is intentionally:
- Return `200` XML when at least one invoice is exportable
- Surface invalid invoices via an `X-Sepa-Skipped` response header
- Return `422` only when no valid invoice remains after validation
- Return `404` only when there are no open/partially-paid invoices at all

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `website/src/lib/native-billing.ts` | Add `sepaMandateRef?`, `sepaMandateDate?` to `Customer`; update `mapCustomer` |
| Create | `website/src/lib/sepa-pain008.ts` | Pure XML generator for pain.008.001.02 |
| Create | `website/src/lib/sepa-pain008.test.ts` | Unit tests for the generator |
| Create | `website/src/pages/api/admin/billing/sepa-export.ts` | Admin download endpoint |
| Modify | `environments/schema.yaml` | Declare `SEPA_CREDITOR_IBAN`, `SEPA_CREDITOR_BIC`, `SEPA_CREDITOR_ID` |
| Modify | `k3d/secrets.yaml` | Add dev placeholder values for the three new SEPA env vars |

---

## Task 1: Extend Customer type with mandate fields

**Files:**
- Modify: `website/src/lib/native-billing.ts` (lines ~9-12 and ~298-313)

- [ ] **Step 1: Add mandate fields to `Customer` interface**

In `website/src/lib/native-billing.ts`, find the `Customer` interface and add two optional fields after `sepaBic`:

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

- [ ] **Step 2: Update `mapCustomer` to read the two new columns**

Find the `mapCustomer` function (~line 298) and add after the `sepaBic` line:

```typescript
function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string, brand: row.brand as string,
    name: row.name as string, email: row.email as string,
    company: (row.company as string) ?? undefined,
    addressLine1: (row.address_line1 as string) ?? undefined,
    city: (row.city as string) ?? undefined,
    postalCode: (row.postal_code as string) ?? undefined,
    country: (row.country as string) ?? 'DE',
    vatNumber: (row.vat_number as string) ?? undefined,
    sepaIban: (row.sepa_iban as string) ?? undefined,
    sepaBic: (row.sepa_bic as string) ?? undefined,
    sepaMandateRef: (row.sepa_mandate_ref as string) ?? undefined,
    sepaMandateDate: (() => {
      const md = row.sepa_mandate_date;
      if (md instanceof Date) {
        return `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}-${String(md.getDate()).padStart(2, '0')}`;
      }
      return (md as string | null) ?? undefined;
    })(),
    defaultLeitwegId: (row.default_leitweg_id as string) ?? undefined,
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd website && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```
Expected: zero `error TS` lines.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/native-billing.ts
git commit -m "feat(billing): expose sepa_mandate_ref/date on Customer type"
```

---

## Task 2: Build the pain.008.001.02 XML generator

**Files:**
- Create: `website/src/lib/sepa-pain008.ts`
- Create: `website/src/lib/sepa-pain008.test.ts`

- [ ] **Step 1: Write the failing test**

Create `website/src/lib/sepa-pain008.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildPain008, type SepaCreditor, type SepaDebitEntry } from './sepa-pain008';

const creditor: SepaCreditor = {
  name: 'Muster GmbH',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  creditorId: 'DE98ZZZ09999999999',
};

const entry: SepaDebitEntry = {
  endToEndId: 'RG2024001',
  amount: 119.00,
  mandateId: 'MNDT-001',
  mandateDate: '2024-01-15',
  debtorName: 'Max Mustermann',
  debtorIban: 'DE75512108001245126199',
  debtorBic: 'SSKMDEMM',
  invoiceNumber: 'RE-2024-001',
};

describe('buildPain008', () => {
  it('produces valid XML envelope', () => {
    const xml = buildPain008(creditor, '2024-02-01', [entry]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('urn:iso:std:iso:20022:tech:xsd:pain.008.001.02');
    expect(xml).toContain('<CstmrDrctDbtInitn>');
  });

  it('embeds creditor identity in GrpHdr and PmtInf', () => {
    const xml = buildPain008(creditor, '2024-02-01', [entry]);
    expect(xml).toContain('<Nm>Muster GmbH</Nm>');
    expect(xml).toContain('<IBAN>DE89370400440532013000</IBAN>');
    expect(xml).toContain('<BIC>COBADEFFXXX</BIC>');
    expect(xml).toContain('<Id>DE98ZZZ09999999999</Id>');
  });

  it('sets correct NbOfTxs and CtrlSum', () => {
    const xml = buildPain008(creditor, '2024-02-01', [entry]);
    expect(xml).toContain('<NbOfTxs>1</NbOfTxs>');
    expect(xml).toContain('<CtrlSum>119.00</CtrlSum>');
  });

  it('embeds debtor mandate and account', () => {
    const xml = buildPain008(creditor, '2024-02-01', [entry]);
    expect(xml).toContain('<MndtId>MNDT-001</MndtId>');
    expect(xml).toContain('<DtOfSgntr>2024-01-15</DtOfSgntr>');
    expect(xml).toContain('<IBAN>DE75512108001245126199</IBAN>');
    expect(xml).toContain('<BIC>SSKMDEMM</BIC>');
    expect(xml).toContain('<Nm>Max Mustermann</Nm>');
  });

  it('sets ReqdColltnDt to the provided collection date', () => {
    const xml = buildPain008(creditor, '2024-02-01', [entry]);
    expect(xml).toContain('<ReqdColltnDt>2024-02-01</ReqdColltnDt>');
  });

  it('includes invoice number in RmtInf', () => {
    const xml = buildPain008(creditor, '2024-02-01', [entry]);
    expect(xml).toContain('<Ustrd>RE-2024-001</Ustrd>');
  });

  it('sums CtrlSum across multiple entries', () => {
    const entry2 = { ...entry, endToEndId: 'RG2024002', amount: 23.80, invoiceNumber: 'RE-2024-002' };
    const xml = buildPain008(creditor, '2024-02-01', [entry, entry2]);
    expect(xml).toContain('<NbOfTxs>2</NbOfTxs>');
    expect(xml).toContain('<CtrlSum>142.80</CtrlSum>');
  });

  it('throws when entries array is empty', () => {
    expect(() => buildPain008(creditor, '2024-02-01', [])).toThrow('at least one entry');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd website && npx vitest run src/lib/sepa-pain008.test.ts 2>&1 | tail -20
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the generator**

Create `website/src/lib/sepa-pain008.ts`:

```typescript
export interface SepaCreditor {
  name: string;
  iban: string;
  bic: string;
  creditorId: string;
}

export interface SepaDebitEntry {
  endToEndId: string;
  amount: number;
  mandateId: string;
  mandateDate: string;
  debtorName: string;
  debtorIban: string;
  debtorBic: string;
  invoiceNumber: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(n: number): string {
  return n.toFixed(2);
}

export function buildPain008(
  creditor: SepaCreditor,
  collectionDate: string,
  entries: SepaDebitEntry[],
): string {
  if (entries.length === 0) throw new Error('buildPain008 requires at least one entry');

  const msgId = `MSG-${Date.now()}`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, '+00:00');
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const ctrlSum = fmt(Math.round(total * 100) / 100);

  const txBlocks = entries.map(e => `
    <DrctDbtTxInf>
      <PmtId><EndToEndId>${esc(e.endToEndId)}</EndToEndId></PmtId>
      <InstdAmt Ccy="EUR">${fmt(e.amount)}</InstdAmt>
      <DrctDbtTx>
        <MndtRltdInf>
          <MndtId>${esc(e.mandateId)}</MndtId>
          <DtOfSgntr>${esc(e.mandateDate)}</DtOfSgntr>
        </MndtRltdInf>
        <CdtrSchmeId>
          <Id><PrvtId><Othr>
            <Id>${esc(creditor.creditorId)}</Id>
            <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
          </Othr></PrvtId></Id>
        </CdtrSchmeId>
      </DrctDbtTx>
      <DbtrAgt><FinInstnId><BIC>${esc(e.debtorBic)}</BIC></FinInstnId></DbtrAgt>
      <Dbtr><Nm>${esc(e.debtorName)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${esc(e.debtorIban)}</IBAN></Id></DbtrAcct>
      <RmtInf><Ustrd>${esc(e.invoiceNumber)}</Ustrd></RmtInf>
    </DrctDbtTxInf>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02 pain.008.001.02.xsd">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>${entries.length}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty><Nm>${esc(creditor.name)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(msgId)}-PMT</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${entries.length}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>CORE</Cd></LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${esc(collectionDate)}</ReqdColltnDt>
      <Cdtr><Nm>${esc(creditor.name)}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${esc(creditor.iban)}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><BIC>${esc(creditor.bic)}</BIC></FinInstnId></CdtrAgt>${txBlocks}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd website && npx vitest run src/lib/sepa-pain008.test.ts 2>&1 | tail -20
```
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/sepa-pain008.ts website/src/lib/sepa-pain008.test.ts
git commit -m "feat(billing): add pain.008.001.02 SEPA XML generator"
```

---

## Task 3: Build the admin download endpoint

**Files:**
- Create: `website/src/pages/api/admin/billing/sepa-export.ts`

The endpoint:
- `GET /api/admin/billing/sepa-export` — returns the XML file
- Optional query params: `?date=YYYY-MM-DD` (collection date, defaults to +2 business days)
- Queries all `open` and `partially_paid` invoices for the current brand, then validates mandate completeness in application code
- Returns `200` with XML when at least one valid debit entry exists; skipped invoices are reported in `X-Sepa-Skipped`
- Returns `422` with JSON only when invoices exist but all are invalid for SEPA export
- Returns `404` if there are no open/partially-paid invoices
- Reads creditor identity from `SEPA_CREDITOR_IBAN`, `SEPA_CREDITOR_BIC`, `SEPA_CREDITOR_ID` env vars
- Returns 503 if those env vars are missing

- [ ] **Step 1: Write the failing test**

Create `website/src/lib/sepa-export.test.ts` to test the mandate-validation query logic in isolation. We'll extract the validation into a small helper the endpoint uses.

Add to `website/src/lib/sepa-pain008.ts` (exports a new validation helper alongside the generator):

```typescript
export interface MandateValidationResult {
  valid: SepaDebitEntry[];
  skipped: Array<{ invoiceNumber: string; reason: string }>;
}

export function validateMandates(
  rows: Array<{
    invoiceNumber: string;
    amount: number;
    paymentReference: string | undefined;
    customerName: string;
    sepaIban: string | undefined;
    sepaBic: string | undefined;
    sepaMandateRef: string | undefined;
    sepaMandateDate: string | undefined;
  }>
): MandateValidationResult {
  const valid: SepaDebitEntry[] = [];
  const skipped: Array<{ invoiceNumber: string; reason: string }> = [];

  for (const row of rows) {
    if (!row.sepaIban)       { skipped.push({ invoiceNumber: row.invoiceNumber, reason: 'missing IBAN' }); continue; }
    if (!row.sepaBic)        { skipped.push({ invoiceNumber: row.invoiceNumber, reason: 'missing BIC' }); continue; }
    if (!row.sepaMandateRef) { skipped.push({ invoiceNumber: row.invoiceNumber, reason: 'missing mandate reference' }); continue; }
    if (!row.sepaMandateDate){ skipped.push({ invoiceNumber: row.invoiceNumber, reason: 'missing mandate date' }); continue; }
    valid.push({
      endToEndId:    row.paymentReference ?? row.invoiceNumber,
      amount:        row.amount,
      mandateId:     row.sepaMandateRef,
      mandateDate:   row.sepaMandateDate,
      debtorName:    row.customerName,
      debtorIban:    row.sepaIban,
      debtorBic:     row.sepaBic,
      invoiceNumber: row.invoiceNumber,
    });
  }
  return { valid, skipped };
}
```

Now create `website/src/lib/sepa-export.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateMandates } from './sepa-pain008';

const goodRow = {
  invoiceNumber: 'RE-2024-001',
  amount: 119.00,
  paymentReference: 'RG2024001',
  customerName: 'Max Mustermann',
  sepaIban: 'DE75512108001245126199',
  sepaBic: 'SSKMDEMM',
  sepaMandateRef: 'MNDT-001',
  sepaMandateDate: '2024-01-15',
};

describe('validateMandates', () => {
  it('accepts a row with all fields', () => {
    const { valid, skipped } = validateMandates([goodRow]);
    expect(valid).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    expect(valid[0].debtorIban).toBe('DE75512108001245126199');
  });

  it('skips rows with missing IBAN', () => {
    const { valid, skipped } = validateMandates([{ ...goodRow, sepaIban: undefined }]);
    expect(valid).toHaveLength(0);
    expect(skipped[0].reason).toBe('missing IBAN');
  });

  it('skips rows with missing mandate reference', () => {
    const { valid, skipped } = validateMandates([{ ...goodRow, sepaMandateRef: undefined }]);
    expect(valid).toHaveLength(0);
    expect(skipped[0].reason).toBe('missing mandate reference');
  });

  it('uses paymentReference as endToEndId when available', () => {
    const { valid } = validateMandates([goodRow]);
    expect(valid[0].endToEndId).toBe('RG2024001');
  });

  it('falls back to invoiceNumber as endToEndId when paymentReference absent', () => {
    const { valid } = validateMandates([{ ...goodRow, paymentReference: undefined }]);
    expect(valid[0].endToEndId).toBe('RE-2024-001');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd website && npx vitest run src/lib/sepa-export.test.ts 2>&1 | tail -20
```
Expected: FAIL — `validateMandates` not exported yet.

- [ ] **Step 3: Add `validateMandates` to `sepa-pain008.ts`**

Append to `website/src/lib/sepa-pain008.ts` after `buildPain008`:

```typescript
export interface MandateValidationResult {
  valid: SepaDebitEntry[];
  skipped: Array<{ invoiceNumber: string; reason: string }>;
}

export function validateMandates(
  rows: Array<{
    invoiceNumber: string;
    amount: number;
    paymentReference: string | undefined;
    customerName: string;
    sepaIban: string | undefined;
    sepaBic: string | undefined;
    sepaMandateRef: string | undefined;
    sepaMandateDate: string | undefined;
  }>
): MandateValidationResult {
  const valid: SepaDebitEntry[] = [];
  const skipped: Array<{ invoiceNumber: string; reason: string }> = [];

  for (const row of rows) {
    if (!row.sepaIban)        { skipped.push({ invoiceNumber: row.invoiceNumber, reason: 'missing IBAN' }); continue; }
    if (!row.sepaBic)         { skipped.push({ invoiceNumber: row.invoiceNumber, reason: 'missing BIC' }); continue; }
    if (!row.sepaMandateRef)  { skipped.push({ invoiceNumber: row.invoiceNumber, reason: 'missing mandate reference' }); continue; }
    if (!row.sepaMandateDate) { skipped.push({ invoiceNumber: row.invoiceNumber, reason: 'missing mandate date' }); continue; }
    valid.push({
      endToEndId:    row.paymentReference ?? row.invoiceNumber,
      amount:        row.amount,
      mandateId:     row.sepaMandateRef,
      mandateDate:   row.sepaMandateDate,
      debtorName:    row.customerName,
      debtorIban:    row.sepaIban,
      debtorBic:     row.sepaBic,
      invoiceNumber: row.invoiceNumber,
    });
  }
  return { valid, skipped };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd website && npx vitest run src/lib/sepa-export.test.ts src/lib/sepa-pain008.test.ts 2>&1 | tail -20
```
Expected: all 14 tests PASS.

- [ ] **Step 5: Create the API endpoint**

Create `website/src/pages/api/admin/billing/sepa-export.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool, initBillingTables } from '../../../../lib/website-db';
import { buildPain008, validateMandates, type SepaCreditor } from '../../../../lib/sepa-pain008';

function nextBusinessDay(days: number): string {
  const d = new Date();
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d.toISOString().split('T')[0];
}

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const creditorIban = process.env.SEPA_CREDITOR_IBAN;
  const creditorBic  = process.env.SEPA_CREDITOR_BIC;
  const creditorId   = process.env.SEPA_CREDITOR_ID;
  if (!creditorIban || !creditorBic || !creditorId) {
    return new Response(
      JSON.stringify({ error: 'SEPA_CREDITOR_IBAN, SEPA_CREDITOR_BIC, SEPA_CREDITOR_ID must be set' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const creditorName = process.env.SEPA_CREDITOR_NAME || process.env.BRAND_NAME || 'Unbekannt';

  const collectionDate = url.searchParams.get('date') ?? nextBusinessDay(2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(collectionDate)) {
    return new Response('date must be YYYY-MM-DD', { status: 400 });
  }

  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';

  const result = await pool.query<{
    number: string;
    gross_amount: number;
    paid_amount: number | null;
    payment_reference: string | null;
    customer_name: string;
    sepa_iban: string | null;
    sepa_bic: string | null;
    sepa_mandate_ref: string | null;
    sepa_mandate_date: Date | null;
  }>(
    `SELECT
       i.number,
       i.gross_amount,
       i.paid_amount,
       i.payment_reference,
       c.name  AS customer_name,
       c.sepa_iban,
       c.sepa_bic,
       c.sepa_mandate_ref,
       c.sepa_mandate_date
     FROM billing_invoices i
     JOIN billing_customers c ON c.id = i.customer_id
     WHERE i.brand = $1
       AND i.status IN ('open', 'partially_paid')
     ORDER BY i.number`,
    [brand]
  );

  if (result.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'no open invoices' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = result.rows.map(r => ({
    invoiceNumber:   r.number,
    amount:          Math.round((r.gross_amount - (r.paid_amount ?? 0)) * 100) / 100,
    paymentReference: r.payment_reference ?? undefined,
    customerName:    r.customer_name,
    sepaIban:        r.sepa_iban ?? undefined,
    sepaBic:         r.sepa_bic ?? undefined,
    sepaMandateRef:  r.sepa_mandate_ref ?? undefined,
    sepaMandateDate: r.sepa_mandate_date
      ? (() => {
          const d = r.sepa_mandate_date!;
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })()
      : undefined,
  }));

  const { valid, skipped } = validateMandates(rows);

  if (valid.length === 0) {
    return new Response(
      JSON.stringify({ error: 'no invoices with complete SEPA mandate data', skipped }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const creditor: SepaCreditor = { name: creditorName, iban: creditorIban, bic: creditorBic, creditorId };
  const xml = buildPain008(creditor, collectionDate, valid);
  const filename = `sepa-lastschrift-${collectionDate}.xml`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      ...(skipped.length > 0 ? { 'X-Sepa-Skipped': JSON.stringify(skipped) } : {}),
    },
  });
};
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd website && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add website/src/lib/sepa-pain008.ts website/src/lib/sepa-export.test.ts \
        website/src/pages/api/admin/billing/sepa-export.ts
git commit -m "feat(billing): SEPA pain.008.001.02 export endpoint with mandate validation"
```

---

## Task 4: Register env vars in schema and dev secrets

**Files:**
- Modify: `environments/schema.yaml`
- Modify: `k3d/secrets.yaml`

- [ ] **Step 1: Add vars to `environments/schema.yaml`**

Find the `env_vars` list. Add after the existing Stripe secrets (or at a logical SEPA block) using the repo's current list-item schema:

```yaml
  - name: SEPA_CREDITOR_IBAN
    required: false
    generate: false
    description: "IBAN of the creditor account for SEPA direct debit (Lastschrift)"
    extra_namespaces:
      - namespace: website
        secret: website-secrets

  - name: SEPA_CREDITOR_BIC
    required: false
    generate: false
    description: "BIC of the creditor bank for SEPA direct debit"
    extra_namespaces:
      - namespace: website
        secret: website-secrets

  - name: SEPA_CREDITOR_ID
    required: false
    generate: false
    description: "Gläubiger-Identifikationsnummer (e.g. DE98ZZZ09999999999)"
    extra_namespaces:
      - namespace: website
        secret: website-secrets
```

- [ ] **Step 2: Add dev placeholder values to `k3d/secrets.yaml`**

Find the `website-secrets` Secret data block. Add three new keys with safe dev placeholders:

```yaml
      SEPA_CREDITOR_IBAN: "DE89370400440532013000"
      SEPA_CREDITOR_BIC: "COBADEFFXXX"
      SEPA_CREDITOR_ID: "DE98ZZZ09999999999"
```

> These placeholder values are fictional test IBANs/IDs — safe for dev use. Real production values go in `environments/.secrets/<env>.yaml`.

- [ ] **Step 3: Validate schema**

```bash
task env:validate ENV=dev 2>&1 | tail -10
```
Expected: "Validation passed" or no errors.

- [ ] **Step 4: Validate manifests**

```bash
task workspace:validate 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add environments/schema.yaml k3d/secrets.yaml
git commit -m "chore(env): register SEPA creditor env vars in schema and dev secrets"
```

---

## Task 5: End-to-end verification

**Files:**
- No code changes expected

- [ ] **Step 1: Run focused unit tests**

```bash
cd website && npx vitest run src/lib/sepa-pain008.test.ts src/lib/sepa-export.test.ts
```
Expected: all tests PASS.

- [ ] **Step 2: Run TypeScript check**

```bash
cd website && npx tsc --noEmit
```
Expected: zero TypeScript errors.

- [ ] **Step 3: Validate manifests and env wiring**

```bash
task env:validate ENV=dev
task workspace:validate
```
Expected: both commands succeed.

- [ ] **Step 4: Smoke-test the endpoint in dev**

After `task website:dev` or a deployed dev environment, call the endpoint as an authenticated admin:

```bash
curl -i "http://localhost:4321/api/admin/billing/sepa-export?date=2026-05-04" \
  -H "Cookie: $(cat /tmp/admin-cookie.txt)"
```

Expected:
- `200 OK` with `Content-Type: application/xml` and `Content-Disposition: attachment`
- Optional `X-Sepa-Skipped` header when some invoices are invalid
- `422` JSON only when no invoice has a complete mandate

- [ ] **Step 5: Optional fixture check**

Open the downloaded XML and verify:
- `<NbOfTxs>` matches the number of exported invoices
- `<CtrlSum>` matches the remaining unpaid gross total
- Each `<DrctDbtTxInf>` contains mandate ID/date, debtor IBAN/BIC, and invoice number in `<Ustrd>`

---

## Self-Review

**Spec coverage:**
- [x] pain.008.001.02 generator → Task 2
- [x] Batch debit file from existing `sepa_*` columns → Task 3 (SQL JOIN query)
- [x] Mandate validation → Task 3 (`validateMandates` helper, Task 2 tests)
- [x] Download endpoint → Task 3 (`sepa-export.ts` GET endpoint)
- [x] Env registration for creditor identity → Task 4
- [x] Verification procedure → Task 5

**Placeholder scan:** None found. All code blocks are complete and runnable.

**Type consistency:**
- `SepaDebitEntry`, `SepaCreditor` defined in Task 2 and used identically in Task 3.
- `validateMandates` added to `sepa-pain008.ts` in Task 3 Step 3 and its import matches in the endpoint.
- `MandateValidationResult` introduced in Task 3 Step 1 test, implemented in Task 3 Step 3 — consistent.

**Outstanding notes:**
- The `SeqTp` is hardcoded to `RCUR`. FRST/OOFF/FNAL are not needed for the current use case (recurring monthly subscriptions). If needed later, add a `sequenceType` parameter to `buildPain008`.
- The endpoint reports skipped invoice info via `X-Sepa-Skipped`. If a UI button is added later, surface this header in the admin page instead of encoding metadata into the XML body.
- `SEPA_CREDITOR_NAME` is optional, falls back to `BRAND_NAME` — no additional schema entry needed since `BRAND_NAME` is already registered.
