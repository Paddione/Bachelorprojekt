# Plan C — ZUGFeRD / XRechnung Output (Sidecar variant) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Note:** A different earlier plan exists at `2026-04-28-zugferd-xrechnung-output.md` (commit `fda64aa`) using pdf-lib + UBL+CII. **This plan is the chosen path** per the brainstorming on 2026-04-28: sidecar (Q4=A) + CII-only (Q2=A). Pick one — do not execute both.

**Goal:** Replace the current Factur-X `MINIMUM` placeholder (XML stored separately, not embedded as PDF/A-3) with a future-proof e-invoicing pipeline that emits a true PDF/A-3 + ZUGFeRD `EN 16931` invoice and a standalone XRechnung 3.0 CII when an invoice carries a Leitweg-ID.

**Architecture:** A single CII D16B generator in `website/src/lib/einvoice/cii.ts` powers two thin profilers (`factur-x.ts`, `xrechnung.ts`). A new Java-based `einvoice-sidecar` Service (Mustangproject 2.x in a Spring Boot wrapper) exposes `/embed` (PDF→PDF/A-3 with embedded `factur-x.xml`) and `/validate` over HTTP inside the `workspace` namespace. The Node side never touches a JVM directly.

**Tech Stack:** TypeScript / Astro / Svelte (existing website), Node `pdfkit` (kept for layout), PostgreSQL `billing_invoices`/`billing_customers` tables (extended), Java 21 + Spring Boot + Mustangproject 2.x (new sidecar), vitest for unit tests, BATS for integration tests, Kustomize manifests under `k3d/`.

**Spec:** `docs/superpowers/specs/2026-04-28-zugferd-xrechnung-output-design.md` is the source of truth. This plan implements it.

---

## File Map

**Created:**
- `website/src/lib/einvoice/types.ts`
- `website/src/lib/einvoice/cii.ts`
- `website/src/lib/einvoice/cii.test.ts`
- `website/src/lib/einvoice/factur-x.ts`
- `website/src/lib/einvoice/factur-x.test.ts`
- `website/src/lib/einvoice/xrechnung.ts`
- `website/src/lib/einvoice/xrechnung.test.ts`
- `website/src/lib/einvoice/sidecar-client.ts`
- `website/src/lib/einvoice/sidecar-client.test.ts`
- `website/src/pages/api/billing/invoice/[id]/xrechnung.xml.ts`
- `website/src/pages/api/admin/billing/[id]/validate.ts`
- `website/test/fixtures/einvoice/regelbesteuerung-19.cii.xml`
- `website/test/fixtures/einvoice/kleinunternehmer.cii.xml`
- `website/test/fixtures/einvoice/mixed-rate.cii.xml`
- `website/test/fixtures/einvoice/reverse-charge-eu.cii.xml`
- `website/test/fixtures/einvoice/sample.pdf`
- `website/scripts/gen-einvoice-fixtures.ts`
- `docker/einvoice-sidecar/Dockerfile`
- `docker/einvoice-sidecar/pom.xml`
- `docker/einvoice-sidecar/src/main/java/de/mentolder/einvoice/Application.java`
- `docker/einvoice-sidecar/src/main/java/de/mentolder/einvoice/EmbedController.java`
- `docker/einvoice-sidecar/src/main/java/de/mentolder/einvoice/ValidateController.java`
- `docker/einvoice-sidecar/src/main/resources/application.yaml`
- `k3d/einvoice-sidecar.yaml`
- `tests/integration/einvoice-sidecar.bats`
- `k3d/docs-content/einvoice.md`

**Modified:**
- `website/src/lib/website-db.ts` — add ALTER TABLE migrations for new columns
- `website/src/lib/invoice-pdf.ts` — call sidecar `/embed` after PDFKit render
- `website/src/lib/native-billing.ts` — wire CII + sidecar into finalization
- `website/src/pages/api/billing/invoice/[id]/zugferd.ts` — re-export factur-x output for one release
- `website/src/pages/api/admin/billing/[id]/send.ts` — attach standalone XRechnung XML when `leitweg_id` set
- `website/src/lib/zugferd.ts` — convert into deprecated re-export shim
- `k3d/kustomization.yaml` — register `einvoice-sidecar.yaml`
- `tests/runner.sh` — register new test ID `FA-30`
- `Taskfile.yml` — add `task einvoice-sidecar:build`, `:import`, `:logs`
- `environments/schema.yaml`, `environments/dev.yaml`, `environments/mentolder.yaml`, `environments/korczewski.yaml`

---

## Task 1: DB schema migrations

**Files:**
- Modify: `website/src/lib/website-db.ts` near line 3148 (after the `billing_invoices` `CREATE TABLE`)
- Modify: `website/src/lib/website-db.ts` near line 3103 (after the `billing_customers` `CREATE TABLE`)

The existing `billing_invoices.zugferd_xml TEXT` column is left as-is; new columns are additive.

- [ ] **Step 1: Append migration block after `billing_invoices` CREATE TABLE**

In `website-db.ts`, find the `await pool.query(\`CREATE TABLE IF NOT EXISTS billing_invoices` block (~ line 3122). Immediately after the closing `)` and `;` for that statement, append:

```ts
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS leitweg_id TEXT`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS factur_x_xml TEXT`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS xrechnung_xml TEXT`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS pdf_a3_blob BYTEA`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS einvoice_validated_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS einvoice_validation_report JSONB`);
```

- [ ] **Step 2: Append migration block after `billing_customers` CREATE TABLE (~ line 3103)**

```ts
  await pool.query(`ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS default_leitweg_id TEXT`);
```

- [ ] **Step 3: Verify schema applies cleanly**

Run:
```bash
cd website && npm run dev &
sleep 5
psql "$DATABASE_URL" -c "\\d billing_invoices" | grep -E 'leitweg_id|factur_x_xml|xrechnung_xml|pdf_a3_blob|einvoice_validated_at|einvoice_validation_report'
psql "$DATABASE_URL" -c "\\d billing_customers" | grep default_leitweg_id
kill %1
```
Expected: all six new columns on `billing_invoices`, plus `default_leitweg_id` on `billing_customers`.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(einvoice): add DB columns for Leitweg-ID, factur-x, XRechnung, PDF/A-3 blob"
```

---

## Task 2: Shared types and Zod schemas

**Files:**
- Create: `website/src/lib/einvoice/types.ts`

- [ ] **Step 1: Create `types.ts`**

```ts
import { z } from 'zod';

export const LEITWEG_ID_REGEX = /^\d{2,12}(-\d{1,30})?(-\d{1,3})?$/;

export const SellerConfigSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  postalCode: z.string().min(1),
  city: z.string().min(1),
  country: z.string().length(2),
  vatId: z.string().optional(),
  taxNumber: z.string().optional(),
  contactEmail: z.string().email(),
  iban: z.string().min(15),
  bic: z.string().optional(),
});
export type SellerConfig = z.infer<typeof SellerConfigSchema>;

export const BuyerConfigSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().length(2).default('DE'),
  vatId: z.string().optional(),
  leitwegId: z.string().regex(LEITWEG_ID_REGEX).optional(),
});
export type BuyerConfig = z.infer<typeof BuyerConfigSchema>;

export const InvoiceLineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().default('C62'),
  unitPrice: z.number(),
  netAmount: z.number(),
  taxRate: z.number().min(0).max(100),
  taxCategory: z.enum(['S', 'E', 'AE', 'Z']),
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

export const InvoiceInputSchema = z.object({
  number: z.string().min(1),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3).default('EUR'),
  taxMode: z.enum(['kleinunternehmer', 'regelbesteuerung']),
  servicePeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  servicePeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentReference: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(InvoiceLineSchema).min(1),
  netTotal: z.number(),
  taxTotal: z.number(),
  grossTotal: z.number(),
  seller: SellerConfigSchema,
  buyer: BuyerConfigSchema,
});
export type InvoiceInput = z.infer<typeof InvoiceInputSchema>;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd website && npx tsc --noEmit src/lib/einvoice/types.ts`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/einvoice/types.ts
git commit -m "feat(einvoice): add InvoiceInput / Seller / Buyer Zod schemas"
```

---

## Task 3: CII generator — Kleinunternehmer (failing test)

**Files:**
- Create: `website/src/lib/einvoice/cii.test.ts`
- Create: `website/src/lib/einvoice/cii.ts`

- [ ] **Step 1: Write the failing test**

```ts
// website/src/lib/einvoice/cii.test.ts
import { describe, it, expect } from 'vitest';
import { generateCII } from './cii';
import type { InvoiceInput } from './types';

const baseSeller = {
  name: 'Patrick K.', address: 'Musterstr. 1', postalCode: '10115', city: 'Berlin',
  country: 'DE', contactEmail: 'rechnung@mentolder.de', iban: 'DE89370400440532013000',
};

describe('generateCII — Kleinunternehmer §19 UStG', () => {
  it('emits EN 16931 CII with no VAT and §19 IncludedNote', () => {
    const input: InvoiceInput = {
      number: 'R-2026-0001', issueDate: '2026-04-01', dueDate: '2026-04-15',
      currency: 'EUR', taxMode: 'kleinunternehmer',
      lines: [{
        description: 'Coaching-Sitzung 60 Min',
        quantity: 1, unit: 'HUR', unitPrice: 120, netAmount: 120,
        taxRate: 0, taxCategory: 'E',
      }],
      netTotal: 120, taxTotal: 0, grossTotal: 120,
      seller: baseSeller,
      buyer: { name: 'Acme GmbH', email: 'buyer@acme.de', country: 'DE' },
    };
    const xml = generateCII(input);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('urn:cen.eu:en16931:2017');
    expect(xml).toContain('R-2026-0001');
    expect(xml).toContain('Kein Ausweis der Umsatzsteuer gemäß § 19 UStG');
    expect(xml).toContain('<ram:CategoryCode>E</ram:CategoryCode>');
    expect(xml).toContain('<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>');
    expect(xml).toContain('<ram:GrandTotalAmount>120.00</ram:GrandTotalAmount>');
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>');
  });
});
```

- [ ] **Step 2: Run test — verify it fails with "module not found"**

Run: `cd website && npx vitest run src/lib/einvoice/cii.test.ts`
Expected: FAIL — module `./cii` cannot be resolved.

- [ ] **Step 3: Implement minimal `cii.ts`**

```ts
// website/src/lib/einvoice/cii.ts
import { InvoiceInputSchema, type InvoiceInput, type InvoiceLine } from './types';

const PROFILE_EN16931 = 'urn:cen.eu:en16931:2017';

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function dt(iso: string): string { return iso.replace(/-/g, ''); }
function fmt(n: number): string { return n.toFixed(2); }

interface Options { profileId?: string; leitwegId?: string; }

export function generateCII(input: InvoiceInput, opts: Options = {}): string {
  const p = InvoiceInputSchema.parse(input);
  const profile = opts.profileId ?? PROFILE_EN16931;
  const isKlein = p.taxMode === 'kleinunternehmer';
  const cur = p.currency;
  const buyerRef = opts.leitwegId ?? p.buyer.leitwegId ?? p.buyer.email;

  const hasReverseCharge = p.lines.some(l => l.taxCategory === 'AE');
  const notes: string[] = [];
  if (isKlein) notes.push('Kein Ausweis der Umsatzsteuer gemäß § 19 UStG.');
  if (hasReverseCharge) notes.push('Reverse charge — VAT to be paid by recipient (Art. 196 VAT Directive 2006/112/EC).');
  const note = notes.length
    ? '\n    ' + notes.map(n => `<ram:IncludedNote><ram:Content>${esc(n)}</ram:Content></ram:IncludedNote>`).join('\n    ')
    : '';

  const lineXml = p.lines.map((l, i) => renderLine(l, i + 1)).join('');
  const taxXml  = renderTaxBuckets(p.lines, isKlein);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${profile}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(p.number)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${dt(p.issueDate)}</udt:DateTimeString></ram:IssueDateTime>${note}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${lineXml}    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc(buyerRef)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${esc(p.seller.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(p.seller.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${esc(p.seller.address)}</ram:LineOne>
          <ram:CityName>${esc(p.seller.city)}</ram:CityName>
          <ram:CountryID>${esc(p.seller.country)}</ram:CountryID>
        </ram:PostalTradeAddress>${p.seller.vatId ? `
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.seller.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(p.buyer.name)}</ram:Name>${p.buyer.vatId ? `
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.buyer.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${cur}</ram:InvoiceCurrencyCode>
${taxXml}      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${fmt(p.netTotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${fmt(p.netTotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${cur}">${fmt(p.taxTotal)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${fmt(p.grossTotal)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${fmt(p.grossTotal)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

function renderLine(l: InvoiceLine, idx: number): string {
  return `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${idx}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(l.description)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${fmt(l.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${esc(l.unit)}">${l.quantity}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${l.taxCategory}</ram:CategoryCode>
          <ram:RateApplicablePercent>${fmt(l.taxRate)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${fmt(l.netAmount)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
`;
}

function renderTaxBuckets(lines: InvoiceLine[], isKlein: boolean): string {
  const buckets = new Map<string, { rate: number; cat: string; basis: number }>();
  for (const l of lines) {
    const key = `${l.taxRate}|${l.taxCategory}`;
    const b = buckets.get(key) ?? { rate: l.taxRate, cat: l.taxCategory, basis: 0 };
    b.basis += l.netAmount;
    buckets.set(key, b);
  }
  return [...buckets.values()].map(b => {
    const tax = isKlein ? 0 : (b.basis * b.rate / 100);
    return `      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${fmt(tax)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${fmt(b.basis)}</ram:BasisAmount>
        <ram:CategoryCode>${b.cat}</ram:CategoryCode>
        <ram:RateApplicablePercent>${fmt(b.rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
`;
  }).join('');
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `cd website && npx vitest run src/lib/einvoice/cii.test.ts`
Expected: 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/einvoice/cii.ts website/src/lib/einvoice/cii.test.ts
git commit -m "feat(einvoice): CII D16B EN 16931 generator (Kleinunternehmer + reverse-charge note)"
```

---

## Task 4: CII generator — Regelbesteuerung 19% (golden test)

**Files:**
- Modify: `website/src/lib/einvoice/cii.test.ts`

- [ ] **Step 1: Append failing test**

```ts
describe('generateCII — Regelbesteuerung 19%', () => {
  it('emits EN 16931 CII with one tax bucket and seller VAT-ID', () => {
    const xml = generateCII({
      number: 'R-2026-0042', issueDate: '2026-04-15', dueDate: '2026-04-29',
      currency: 'EUR', taxMode: 'regelbesteuerung',
      lines: [
        { description: 'Beratung', quantity: 4, unit: 'HUR', unitPrice: 150, netAmount: 600, taxRate: 19, taxCategory: 'S' },
      ],
      netTotal: 600, taxTotal: 114, grossTotal: 714,
      seller: { ...baseSeller, vatId: 'DE123456789' },
      buyer: { name: 'Acme GmbH', email: 'buyer@acme.de', country: 'DE', vatId: 'DE987654321' },
    });
    expect(xml).toContain('<ram:CategoryCode>S</ram:CategoryCode>');
    expect(xml).toContain('<ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>');
    expect(xml).toContain('<ram:CalculatedAmount>114.00</ram:CalculatedAmount>');
    expect(xml).toContain('<ram:BasisAmount>600.00</ram:BasisAmount>');
    expect(xml).toContain('<ram:GrandTotalAmount>714.00</ram:GrandTotalAmount>');
    expect(xml).toContain('schemeID="VA">DE123456789');
    expect(xml).toContain('schemeID="VA">DE987654321');
    expect(xml).not.toContain('§ 19 UStG');
  });
});
```

- [ ] **Step 2: Run — verify it passes (no impl change required)**

Run: `cd website && npx vitest run src/lib/einvoice/cii.test.ts`
Expected: 2 tests passed.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/einvoice/cii.test.ts
git commit -m "test(einvoice): lock down CII Regelbesteuerung 19% golden output"
```

---

## Task 5: CII generator — mixed-rate (7% + 19%)

**Files:**
- Modify: `website/src/lib/einvoice/cii.test.ts`

- [ ] **Step 1: Append failing test**

```ts
describe('generateCII — mixed rates', () => {
  it('emits one ApplicableTradeTax per (rate, category) bucket', () => {
    const xml = generateCII({
      number: 'R-2026-0050', issueDate: '2026-04-20', dueDate: '2026-05-04',
      currency: 'EUR', taxMode: 'regelbesteuerung',
      lines: [
        { description: 'Buch', quantity: 2, unit: 'C62', unitPrice: 25,  netAmount: 50,  taxRate: 7,  taxCategory: 'S' },
        { description: 'Service', quantity: 1, unit: 'C62', unitPrice: 100, netAmount: 100, taxRate: 19, taxCategory: 'S' },
      ],
      netTotal: 150, taxTotal: 22.5, grossTotal: 172.5,
      seller: { ...baseSeller, vatId: 'DE123456789' },
      buyer: { name: 'Buchladen', email: 'b@x.de', country: 'DE' },
    });
    const seven = xml.match(/<ram:RateApplicablePercent>7\.00<\/ram:RateApplicablePercent>/g);
    const nineteen = xml.match(/<ram:RateApplicablePercent>19\.00<\/ram:RateApplicablePercent>/g);
    expect(seven?.length).toBe(2);   // 1 bucket + 1 line
    expect(nineteen?.length).toBe(2);
    expect(xml).toContain('<ram:BasisAmount>50.00</ram:BasisAmount>');
    expect(xml).toContain('<ram:BasisAmount>100.00</ram:BasisAmount>');
  });
});
```

- [ ] **Step 2: Run — verify all 3 pass**

Run: `cd website && npx vitest run src/lib/einvoice/cii.test.ts`
Expected: 3 tests passed.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/einvoice/cii.test.ts
git commit -m "test(einvoice): mixed 7%+19% bucket grouping"
```

---

## Task 6: CII generator — reverse-charge B2B EU

**Files:**
- Modify: `website/src/lib/einvoice/cii.test.ts`

The reverse-charge note is already implemented in Task 3.

- [ ] **Step 1: Append failing test**

```ts
describe('generateCII — reverse-charge B2B EU', () => {
  it('adds reverse-charge note and emits CategoryCode AE with 0% rate', () => {
    const xml = generateCII({
      number: 'R-2026-0080', issueDate: '2026-04-25', dueDate: '2026-05-09',
      currency: 'EUR', taxMode: 'regelbesteuerung',
      lines: [
        { description: 'Cross-border B2B service', quantity: 1, unit: 'C62',
          unitPrice: 1000, netAmount: 1000, taxRate: 0, taxCategory: 'AE' },
      ],
      netTotal: 1000, taxTotal: 0, grossTotal: 1000,
      seller: { ...baseSeller, vatId: 'DE123456789' },
      buyer: { name: 'NL Buyer BV', email: 'x@y.nl', country: 'NL', vatId: 'NL123456789B01' },
    });
    expect(xml).toContain('Reverse charge');
    expect(xml).toContain('<ram:CategoryCode>AE</ram:CategoryCode>');
    expect(xml).toContain('<ram:CalculatedAmount>0.00</ram:CalculatedAmount>');
  });
});
```

- [ ] **Step 2: Run — verify all 4 pass**

Run: `cd website && npx vitest run src/lib/einvoice/cii.test.ts`
Expected: 4 tests passed.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/einvoice/cii.test.ts
git commit -m "test(einvoice): reverse-charge B2B EU CII output"
```

---

## Task 7: factur-x.ts profiler

**Files:**
- Create: `website/src/lib/einvoice/factur-x.ts`
- Create: `website/src/lib/einvoice/factur-x.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// website/src/lib/einvoice/factur-x.test.ts
import { describe, it, expect } from 'vitest';
import { generateFacturX } from './factur-x';
import type { InvoiceInput } from './types';

const fixture: InvoiceInput = {
  number: 'R-1', issueDate: '2026-04-01', dueDate: '2026-04-15', currency: 'EUR',
  taxMode: 'regelbesteuerung',
  lines: [{ description: 'X', quantity: 1, unit: 'C62', unitPrice: 100, netAmount: 100, taxRate: 19, taxCategory: 'S' }],
  netTotal: 100, taxTotal: 19, grossTotal: 119,
  seller: { name: 'P', address: 'A', postalCode: '1', city: 'B', country: 'DE',
            contactEmail: 'a@b.de', iban: 'DE89370400440532013000', vatId: 'DE1' },
  buyer:  { name: 'C', email: 'c@d.de', country: 'DE' },
};

describe('generateFacturX', () => {
  it('uses the EN 16931 profile URI', () => {
    const xml = generateFacturX(fixture);
    expect(xml).toContain('<ram:ID>urn:cen.eu:en16931:2017</ram:ID>');
  });
});
```

- [ ] **Step 2: Run — verify failure (module missing)**

Run: `cd website && npx vitest run src/lib/einvoice/factur-x.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// website/src/lib/einvoice/factur-x.ts
import { generateCII } from './cii';
import type { InvoiceInput } from './types';

export const FACTURX_PROFILE_EN16931 = 'urn:cen.eu:en16931:2017';

export function generateFacturX(input: InvoiceInput): string {
  return generateCII(input, { profileId: FACTURX_PROFILE_EN16931 });
}
```

- [ ] **Step 4: Run — verify pass**

Run: `cd website && npx vitest run src/lib/einvoice/factur-x.test.ts`
Expected: 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/einvoice/factur-x.ts website/src/lib/einvoice/factur-x.test.ts
git commit -m "feat(einvoice): factur-x EN 16931 profiler"
```

---

## Task 8: xrechnung.ts profiler

**Files:**
- Create: `website/src/lib/einvoice/xrechnung.ts`
- Create: `website/src/lib/einvoice/xrechnung.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// website/src/lib/einvoice/xrechnung.test.ts
import { describe, it, expect } from 'vitest';
import { generateXRechnung } from './xrechnung';
import type { InvoiceInput } from './types';

const baseInput: InvoiceInput = {
  number: 'R-9', issueDate: '2026-04-01', dueDate: '2026-04-15', currency: 'EUR',
  taxMode: 'regelbesteuerung',
  lines: [{ description: 'X', quantity: 1, unit: 'C62', unitPrice: 100, netAmount: 100, taxRate: 19, taxCategory: 'S' }],
  netTotal: 100, taxTotal: 19, grossTotal: 119,
  seller: { name: 'P', address: 'A', postalCode: '1', city: 'B', country: 'DE',
            contactEmail: 'a@b.de', iban: 'DE89370400440532013000', vatId: 'DE1' },
  buyer:  { name: 'Behörde X', email: 'amt@example.gov.de', country: 'DE',
            leitwegId: '04011000-1234512345-67' },
};

describe('generateXRechnung', () => {
  it('uses the XRechnung 3.0 profile and Leitweg-ID as BuyerReference', () => {
    const xml = generateXRechnung(baseInput);
    expect(xml).toContain('urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0');
    expect(xml).toContain('<ram:BuyerReference>04011000-1234512345-67</ram:BuyerReference>');
  });

  it('rejects an invoice without a Leitweg-ID', () => {
    expect(() => generateXRechnung({ ...baseInput, buyer: { ...baseInput.buyer, leitwegId: undefined } }))
      .toThrow(/Leitweg-ID/);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `cd website && npx vitest run src/lib/einvoice/xrechnung.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// website/src/lib/einvoice/xrechnung.ts
import { generateCII } from './cii';
import { LEITWEG_ID_REGEX, type InvoiceInput } from './types';

export const XRECHNUNG_3_0_PROFILE =
  'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0';

export function generateXRechnung(input: InvoiceInput): string {
  const id = input.buyer.leitwegId;
  if (!id) throw new Error('XRechnung requires a Leitweg-ID on the buyer (BT-10).');
  if (!LEITWEG_ID_REGEX.test(id)) throw new Error(`Invalid Leitweg-ID format: ${id}`);
  return generateCII(input, { profileId: XRECHNUNG_3_0_PROFILE, leitwegId: id });
}
```

- [ ] **Step 4: Run — verify pass**

Run: `cd website && npx vitest run src/lib/einvoice/xrechnung.test.ts`
Expected: 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/einvoice/xrechnung.ts website/src/lib/einvoice/xrechnung.test.ts
git commit -m "feat(einvoice): XRechnung 3.0 CIUS profiler with Leitweg-ID enforcement"
```

---

## Task 9: einvoice-sidecar — Spring Boot skeleton

**Files:**
- Create: `docker/einvoice-sidecar/pom.xml`
- Create: `docker/einvoice-sidecar/src/main/java/de/mentolder/einvoice/Application.java`
- Create: `docker/einvoice-sidecar/src/main/resources/application.yaml`

- [ ] **Step 1: Create `pom.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>de.mentolder</groupId>
  <artifactId>einvoice-sidecar</artifactId>
  <version>1.0.0</version>
  <packaging>jar</packaging>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.4</version>
  </parent>
  <properties>
    <java.version>21</java.version>
    <mustangproject.version>2.16.1</mustangproject.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <dependency>
      <groupId>org.mustangproject</groupId>
      <artifactId>library</artifactId>
      <version>${mustangproject.version}</version>
    </dependency>
    <dependency>
      <groupId>org.mustangproject</groupId>
      <artifactId>validator</artifactId>
      <version>${mustangproject.version}</version>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
```

- [ ] **Step 2: Create `Application.java`**

```java
package de.mentolder.einvoice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
```

- [ ] **Step 3: Create `application.yaml`**

```yaml
server:
  port: 8080
spring:
  application:
    name: einvoice-sidecar
  servlet:
    multipart:
      max-file-size: 50MB
      max-request-size: 60MB
management:
  endpoints:
    web:
      exposure:
        include: health
```

- [ ] **Step 4: Verify it compiles**

Run: `cd docker/einvoice-sidecar && mvn -q -DskipTests package`
Expected: BUILD SUCCESS.

- [ ] **Step 5: Commit**

```bash
git add docker/einvoice-sidecar/pom.xml docker/einvoice-sidecar/src/main/java/de/mentolder/einvoice/Application.java docker/einvoice-sidecar/src/main/resources/application.yaml
git commit -m "feat(einvoice-sidecar): Spring Boot skeleton with Mustangproject deps"
```

---

## Task 10: einvoice-sidecar — `/embed` endpoint

**Files:**
- Create: `docker/einvoice-sidecar/src/main/java/de/mentolder/einvoice/EmbedController.java`

- [ ] **Step 1: Create `EmbedController.java`**

```java
package de.mentolder.einvoice;

import org.mustangproject.ZUGFeRD.PDFAConformanceLevel;
import org.mustangproject.ZUGFeRD.ZUGFeRDExporterFromA1;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import java.io.*;
import java.util.Base64;
import java.util.Map;

@RestController
public class EmbedController {

  public record EmbedRequest(String pdf, String xml) {}
  public record EmbedResponse(String pdf, Map<String, Object> meta) {}

  @PostMapping(value = "/embed",
               consumes = MediaType.APPLICATION_JSON_VALUE,
               produces = MediaType.APPLICATION_JSON_VALUE)
  public EmbedResponse embed(@RequestBody EmbedRequest req) throws Exception {
    byte[] pdfBytes = Base64.getDecoder().decode(req.pdf());
    byte[] xmlBytes = Base64.getDecoder().decode(req.xml());

    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try (var exporter = new ZUGFeRDExporterFromA1()
        .setProducer("mentolder-einvoice-sidecar")
        .setCreator("mentolder")
        .setConformanceLevel(PDFAConformanceLevel.UA)
        .load(new ByteArrayInputStream(pdfBytes))) {
      exporter.setXML(xmlBytes);
      exporter.export(out);
    }
    byte[] pdfA3 = out.toByteArray();
    return new EmbedResponse(
      Base64.getEncoder().encodeToString(pdfA3),
      Map.of("size", pdfA3.length, "profile", "factur-x:EN 16931")
    );
  }
}
```

- [ ] **Step 2: Build**

Run: `cd docker/einvoice-sidecar && mvn -q -DskipTests package`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add docker/einvoice-sidecar/src/main/java/de/mentolder/einvoice/EmbedController.java
git commit -m "feat(einvoice-sidecar): POST /embed → PDF/A-3 with factur-x.xml"
```

---

## Task 11: einvoice-sidecar — `/validate` endpoint

**Files:**
- Create: `docker/einvoice-sidecar/src/main/java/de/mentolder/einvoice/ValidateController.java`

- [ ] **Step 1: Create `ValidateController.java`**

```java
package de.mentolder.einvoice;

import org.mustangproject.validator.ZUGFeRDValidator;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import java.nio.file.*;
import java.util.*;

@RestController
public class ValidateController {

  public record ValidateRequest(String pdf, String xml) {}
  public record ValidateResponse(boolean ok, List<String> errors, List<String> warnings, String reportXml) {}

  @PostMapping(value = "/validate",
               consumes = MediaType.APPLICATION_JSON_VALUE,
               produces = MediaType.APPLICATION_JSON_VALUE)
  public ValidateResponse validate(@RequestBody ValidateRequest req) throws Exception {
    boolean isPdf = req.pdf() != null;
    Path tmp = Files.createTempFile("einvoice-", isPdf ? ".pdf" : ".xml");
    try {
      byte[] payload = Base64.getDecoder().decode(isPdf ? req.pdf() : req.xml());
      Files.write(tmp, payload);
      ZUGFeRDValidator v = new ZUGFeRDValidator();
      String reportXml = v.validate(tmp.toString());
      boolean ok = !reportXml.contains("severity=\"3\"") && !reportXml.contains("severity=\"5\"");
      List<String> errors = extractMessages(reportXml, "error");
      List<String> warnings = extractMessages(reportXml, "warning");
      return new ValidateResponse(ok, errors, warnings, reportXml);
    } finally {
      Files.deleteIfExists(tmp);
    }
  }

  private List<String> extractMessages(String xml, String type) {
    List<String> out = new ArrayList<>();
    String marker = "<" + type + ">";
    int idx = 0;
    while ((idx = xml.indexOf(marker, idx)) != -1) {
      int end = xml.indexOf("</" + type + ">", idx);
      if (end < 0) break;
      out.add(xml.substring(idx + marker.length(), end));
      idx = end;
    }
    return out;
  }
}
```

- [ ] **Step 2: Build**

Run: `cd docker/einvoice-sidecar && mvn -q -DskipTests package`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add docker/einvoice-sidecar/src/main/java/de/mentolder/einvoice/ValidateController.java
git commit -m "feat(einvoice-sidecar): POST /validate using Mustangproject validator"
```

---

## Task 12: einvoice-sidecar — Dockerfile + Taskfile entries

**Files:**
- Create: `docker/einvoice-sidecar/Dockerfile`
- Modify: `Taskfile.yml`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/target/einvoice-sidecar-1.0.0.jar app.jar
EXPOSE 8080
USER 1000:1000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O- http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-Xmx384m", "-jar", "/app/app.jar"]
```

- [ ] **Step 2: Add Taskfile entries**

In `Taskfile.yml`, add the following tasks (alongside other namespaced groups):

```yaml
  einvoice-sidecar:build:
    desc: "Build the einvoice-sidecar Docker image"
    cmds:
      - docker build -t einvoice-sidecar:dev docker/einvoice-sidecar

  einvoice-sidecar:import:
    desc: "Import einvoice-sidecar image into k3d cluster"
    deps: [einvoice-sidecar:build]
    cmds:
      - k3d image import einvoice-sidecar:dev -c "{{.K3D_CLUSTER | default \"workspace\"}}"

  einvoice-sidecar:logs:
    desc: "Tail einvoice-sidecar logs"
    cmds:
      - kubectl -n workspace logs -l app=einvoice-sidecar --tail=200 -f
```

- [ ] **Step 3: Build the image**

Run: `task einvoice-sidecar:build`
Expected: image `einvoice-sidecar:dev` built successfully.

- [ ] **Step 4: Commit**

```bash
git add docker/einvoice-sidecar/Dockerfile Taskfile.yml
git commit -m "feat(einvoice-sidecar): Dockerfile + task entries (build/import/logs)"
```

---

## Task 13: einvoice-sidecar — K8s Deployment + Service

**Files:**
- Create: `k3d/einvoice-sidecar.yaml`
- Modify: `k3d/kustomization.yaml`

- [ ] **Step 1: Create the manifest**

```yaml
# k3d/einvoice-sidecar.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: einvoice-sidecar
  namespace: workspace
  labels:
    app: einvoice-sidecar
spec:
  replicas: 1
  selector:
    matchLabels:
      app: einvoice-sidecar
  template:
    metadata:
      labels:
        app: einvoice-sidecar
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
      containers:
        - name: sidecar
          image: einvoice-sidecar:dev
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: 8080
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          readinessProbe:
            httpGet:
              path: /actuator/health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /actuator/health
              port: http
            initialDelaySeconds: 60
            periodSeconds: 30
---
apiVersion: v1
kind: Service
metadata:
  name: einvoice-sidecar
  namespace: workspace
spec:
  type: ClusterIP
  selector:
    app: einvoice-sidecar
  ports:
    - name: http
      port: 80
      targetPort: 8080
```

- [ ] **Step 2: Register in kustomization**

In `k3d/kustomization.yaml`, add to the `resources:` list (alphabetically):

```yaml
  - einvoice-sidecar.yaml
```

- [ ] **Step 3: Validate**

Run: `task workspace:validate`
Expected: kustomize build passes; new Deployment + Service appear in the rendered manifest.

- [ ] **Step 4: Deploy to dev**

```bash
task einvoice-sidecar:import
task workspace:deploy
kubectl -n workspace rollout status deploy/einvoice-sidecar --timeout=120s
kubectl -n workspace get svc einvoice-sidecar
```
Expected: rollout succeeds; service has `ClusterIP`.

- [ ] **Step 5: Commit**

```bash
git add k3d/einvoice-sidecar.yaml k3d/kustomization.yaml
git commit -m "feat(einvoice-sidecar): K8s Deployment + ClusterIP Service"
```

---

## Task 14: sidecar-client.ts — typed HTTP client

**Files:**
- Create: `website/src/lib/einvoice/sidecar-client.ts`
- Create: `website/src/lib/einvoice/sidecar-client.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// website/src/lib/einvoice/sidecar-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSidecarClient, SidecarUnavailableError } from './sidecar-client';

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock as unknown as typeof fetch; });

describe('sidecar-client', () => {
  const client = createSidecarClient('http://einvoice-sidecar.workspace.svc.cluster.local');

  it('embed: posts base64 + parses base64 response', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ pdf: Buffer.from('OK').toString('base64'), meta: { size: 2 } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ));
    const out = await client.embed(Buffer.from('PDF'), '<x/>');
    expect(out.pdf.toString('utf8')).toBe('OK');
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.pdf).toBe(Buffer.from('PDF').toString('base64'));
  });

  it('embed: throws SidecarUnavailableError on 5xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('upstream', { status: 503 }));
    await expect(client.embed(Buffer.from('X'), '<x/>')).rejects.toThrow(SidecarUnavailableError);
  });

  it('validate: parses {ok, errors, warnings}', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: false, errors: ['e1'], warnings: ['w1'], reportXml: '<r/>' }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ));
    const r = await client.validate({ pdf: Buffer.from('X') });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(['e1']);
    expect(r.warnings).toEqual(['w1']);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `cd website && npx vitest run src/lib/einvoice/sidecar-client.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// website/src/lib/einvoice/sidecar-client.ts
export class SidecarUnavailableError extends Error {
  constructor(public status: number, msg: string) { super(msg); this.name = 'SidecarUnavailableError'; }
}
export class SidecarValidationError extends Error {
  constructor(msg: string) { super(msg); this.name = 'SidecarValidationError'; }
}

export interface EmbedResult { pdf: Buffer; meta: Record<string, unknown>; }
export interface ValidateResult { ok: boolean; errors: string[]; warnings: string[]; reportXml: string; }

export interface SidecarClient {
  embed(pdf: Buffer, xml: string): Promise<EmbedResult>;
  validate(payload: { pdf?: Buffer; xml?: string }): Promise<ValidateResult>;
}

export function createSidecarClient(baseUrl: string, opts: { timeoutMs?: number } = {}): SidecarClient {
  const timeoutMs = opts.timeoutMs ?? 30_000;

  async function call<T>(path: string, body: unknown): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (r.status >= 500) throw new SidecarUnavailableError(r.status, `${path} → ${r.status}`);
      if (r.status >= 400) throw new SidecarValidationError(`${path} → ${r.status}: ${await r.text()}`);
      return (await r.json()) as T;
    } catch (e) {
      if (e instanceof SidecarUnavailableError || e instanceof SidecarValidationError) throw e;
      throw new SidecarUnavailableError(0, `network: ${(e as Error).message}`);
    } finally { clearTimeout(t); }
  }

  return {
    async embed(pdf, xml) {
      const res = await call<{ pdf: string; meta: Record<string, unknown> }>('/embed', {
        pdf: pdf.toString('base64'),
        xml: Buffer.from(xml, 'utf8').toString('base64'),
      });
      return { pdf: Buffer.from(res.pdf, 'base64'), meta: res.meta };
    },
    async validate(payload) {
      return call<ValidateResult>('/validate', {
        pdf: payload.pdf?.toString('base64'),
        xml: payload.xml ? Buffer.from(payload.xml, 'utf8').toString('base64') : undefined,
      });
    },
  };
}

export function sidecarBaseUrlFromEnv(): string {
  return process.env.EINVOICE_SIDECAR_URL || 'http://einvoice-sidecar.workspace.svc.cluster.local';
}
```

- [ ] **Step 4: Run — verify pass**

Run: `cd website && npx vitest run src/lib/einvoice/sidecar-client.test.ts`
Expected: 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/einvoice/sidecar-client.ts website/src/lib/einvoice/sidecar-client.test.ts
git commit -m "feat(einvoice): typed sidecar HTTP client with error mapping"
```

---

## Task 15: Wire CII + sidecar into invoice finalization

**Files:**
- Modify: `website/src/lib/invoice-pdf.ts`
- Modify: `website/src/lib/native-billing.ts`

- [ ] **Step 1: Find the finalization function**

Run: `grep -n "status.*issued\|finalize\|finalise" website/src/lib/native-billing.ts`
Note the function name. The remaining steps assume `finalizeInvoice(invoiceId)`.

- [ ] **Step 2: Add helper in `invoice-pdf.ts`**

Append to `website/src/lib/invoice-pdf.ts`:

```ts
import { createSidecarClient, sidecarBaseUrlFromEnv } from './einvoice/sidecar-client';

export async function embedFacturX(rawPdf: Buffer, facturXXml: string): Promise<Buffer> {
  const enabled = process.env.EINVOICE_SIDECAR_ENABLED === 'true';
  if (!enabled) return rawPdf;
  const client = createSidecarClient(sidecarBaseUrlFromEnv());
  const out = await client.embed(rawPdf, facturXXml);
  return out.pdf;
}
```

- [ ] **Step 3: Modify `finalizeInvoice` in `native-billing.ts`**

In the function that transitions `draft` → `issued`, after the existing PDF generation, add:

```ts
import { generateFacturX } from './einvoice/factur-x';
import { generateXRechnung } from './einvoice/xrechnung';
import { embedFacturX } from './invoice-pdf';
import { createSidecarClient, sidecarBaseUrlFromEnv, SidecarUnavailableError } from './einvoice/sidecar-client';

// ... inside finalizeInvoice, after building `invoiceInput`:
const facturXXml = generateFacturX(invoiceInput);
const xrechnungXml = invoiceInput.buyer.leitwegId ? generateXRechnung(invoiceInput) : null;

const rawPdf = await generateInvoicePdf({ /* existing args */ });
let pdfA3: Buffer = rawPdf;
let validation: { ok: boolean; errors: string[]; warnings: string[]; reportXml: string } | null = null;

if (process.env.EINVOICE_SIDECAR_ENABLED === 'true') {
  try {
    pdfA3 = await embedFacturX(rawPdf, facturXXml);
    const client = createSidecarClient(sidecarBaseUrlFromEnv());
    validation = await client.validate({ pdf: pdfA3 });
    if (!validation.ok && validation.errors.length > 0) {
      throw new Error(`E-invoice validation failed: ${validation.errors.join('; ')}`);
    }
  } catch (e) {
    if (e instanceof SidecarUnavailableError) throw new Error('E-invoice sidecar unavailable; finalization aborted.');
    throw e;
  }
}

await pool.query(
  `UPDATE billing_invoices
      SET status='issued',
          factur_x_xml=$1,
          xrechnung_xml=$2,
          pdf_a3_blob=$3,
          einvoice_validated_at=$4,
          einvoice_validation_report=$5,
          updated_at=now()
    WHERE id=$6`,
  [facturXXml, xrechnungXml, pdfA3, validation ? new Date() : null, validation as unknown, invoiceId]
);
```

(Adjust to match the actual variable names and parameter order in your `finalizeInvoice`.)

- [ ] **Step 4: Run all unit tests**

Run: `cd website && npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/invoice-pdf.ts website/src/lib/native-billing.ts
git commit -m "feat(einvoice): wire CII + sidecar embed/validate into finalization (flag-gated)"
```

---

## Task 16: Regression fixtures + golden CII outputs

**Files:**
- Create: `website/scripts/gen-einvoice-fixtures.ts`
- Create: `website/test/fixtures/einvoice/{kleinunternehmer,regelbesteuerung-19,mixed-rate,reverse-charge-eu}.cii.xml`
- Create: `website/test/fixtures/einvoice/sample.pdf`

- [ ] **Step 1: Write the fixture generator script**

```ts
// website/scripts/gen-einvoice-fixtures.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateFacturX } from '../src/lib/einvoice/factur-x';
import type { InvoiceInput } from '../src/lib/einvoice/types';

const seller = { name: 'Patrick K.', address: 'Musterstr. 1', postalCode: '10115',
  city: 'Berlin', country: 'DE', contactEmail: 'r@m.de', iban: 'DE89370400440532013000', vatId: 'DE123456789' };

const cases: Array<[string, InvoiceInput]> = [
  ['kleinunternehmer', {
    number: 'F-K-1', issueDate: '2026-04-01', dueDate: '2026-04-15', currency: 'EUR',
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'Coaching', quantity: 1, unit: 'HUR', unitPrice: 120, netAmount: 120, taxRate: 0, taxCategory: 'E' }],
    netTotal: 120, taxTotal: 0, grossTotal: 120,
    seller: { ...seller, vatId: undefined }, buyer: { name: 'Acme', email: 'a@x.de', country: 'DE' },
  }],
  ['regelbesteuerung-19', {
    number: 'F-R-1', issueDate: '2026-04-01', dueDate: '2026-04-15', currency: 'EUR',
    taxMode: 'regelbesteuerung',
    lines: [{ description: 'Beratung', quantity: 4, unit: 'HUR', unitPrice: 150, netAmount: 600, taxRate: 19, taxCategory: 'S' }],
    netTotal: 600, taxTotal: 114, grossTotal: 714,
    seller, buyer: { name: 'Acme', email: 'a@x.de', country: 'DE', vatId: 'DE987654321' },
  }],
  ['mixed-rate', {
    number: 'F-M-1', issueDate: '2026-04-01', dueDate: '2026-04-15', currency: 'EUR',
    taxMode: 'regelbesteuerung',
    lines: [
      { description: 'Buch', quantity: 2, unit: 'C62', unitPrice: 25, netAmount: 50, taxRate: 7, taxCategory: 'S' },
      { description: 'Service', quantity: 1, unit: 'C62', unitPrice: 100, netAmount: 100, taxRate: 19, taxCategory: 'S' },
    ],
    netTotal: 150, taxTotal: 22.5, grossTotal: 172.5,
    seller, buyer: { name: 'Buchladen', email: 'b@x.de', country: 'DE' },
  }],
  ['reverse-charge-eu', {
    number: 'F-A-1', issueDate: '2026-04-01', dueDate: '2026-04-15', currency: 'EUR',
    taxMode: 'regelbesteuerung',
    lines: [{ description: 'Cross-border B2B', quantity: 1, unit: 'C62', unitPrice: 1000, netAmount: 1000, taxRate: 0, taxCategory: 'AE' }],
    netTotal: 1000, taxTotal: 0, grossTotal: 1000,
    seller, buyer: { name: 'NL Buyer BV', email: 'x@y.nl', country: 'NL', vatId: 'NL123456789B01' },
  }],
];

mkdirSync('test/fixtures/einvoice', { recursive: true });
for (const [name, input] of cases) {
  writeFileSync(`test/fixtures/einvoice/${name}.cii.xml`, generateFacturX(input));
}
console.log('Wrote', cases.length, 'fixtures.');
```

- [ ] **Step 2: Run the script**

Run: `cd website && npx tsx scripts/gen-einvoice-fixtures.ts`
Expected: 4 XML files written.

- [ ] **Step 3: Sanity-check XML well-formedness**

Run: `xmllint --noout website/test/fixtures/einvoice/*.cii.xml`
Expected: no output.

- [ ] **Step 4: Generate the sample PDF for sidecar tests**

Run from `website/`:

```bash
node -e "
const PDFDocument = require('pdfkit'); const fs = require('fs');
const doc = new PDFDocument({size:'A4'});
doc.pipe(fs.createWriteStream('test/fixtures/einvoice/sample.pdf'));
doc.fontSize(16).text('Sample invoice for sidecar tests'); doc.end();
"
```

- [ ] **Step 5: Commit**

```bash
git add website/scripts/gen-einvoice-fixtures.ts website/test/fixtures/einvoice/
git commit -m "test(einvoice): regression corpus of 4 golden CII fixtures + sample PDF"
```

---

## Task 17: API route — standalone XRechnung XML

**Files:**
- Create: `website/src/pages/api/billing/invoice/[id]/xrechnung.xml.ts`

- [ ] **Step 1: Implement the route**

```ts
// website/src/pages/api/billing/invoice/[id]/xrechnung.xml.ts
import type { APIRoute } from 'astro';
import { pool } from '../../../../../lib/website-db';
import { requireAdmin } from '../../../../../lib/auth';

export const GET: APIRoute = async ({ params, request }) => {
  await requireAdmin(request);
  const id = params.id!;
  const r = await pool.query<{ xrechnung_xml: string | null; number: string }>(
    `SELECT xrechnung_xml, number FROM billing_invoices WHERE id = $1`, [id]
  );
  if (r.rowCount === 0) return new Response('not found', { status: 404 });
  const row = r.rows[0];
  if (!row.xrechnung_xml) return new Response('no XRechnung XML for this invoice (Leitweg-ID required)', { status: 404 });
  return new Response(row.xrechnung_xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'content-disposition': `attachment; filename="xrechnung-${row.number}.xml"`,
    },
  });
};
```

(Adjust `requireAdmin` import to match your auth module.)

- [ ] **Step 2: Smoke test**

```bash
cd website && npm run dev &
sleep 4
curl -sI -b "$ADMIN_COOKIE_JAR" http://localhost:4321/api/billing/invoice/<id>/xrechnung.xml
kill %1
```
Expected: `200 OK` for an invoice with `leitweg_id` set, `404` otherwise.

- [ ] **Step 3: Commit**

```bash
git add 'website/src/pages/api/billing/invoice/[id]/xrechnung.xml.ts'
git commit -m "feat(einvoice): GET /api/billing/invoice/:id/xrechnung.xml route"
```

---

## Task 18: API route — admin "validate now"

**Files:**
- Create: `website/src/pages/api/admin/billing/[id]/validate.ts`

- [ ] **Step 1: Implement**

```ts
// website/src/pages/api/admin/billing/[id]/validate.ts
import type { APIRoute } from 'astro';
import { pool } from '../../../../../lib/website-db';
import { requireAdmin } from '../../../../../lib/auth';
import { createSidecarClient, sidecarBaseUrlFromEnv } from '../../../../../lib/einvoice/sidecar-client';

export const POST: APIRoute = async ({ params, request }) => {
  await requireAdmin(request);
  const id = params.id!;
  const r = await pool.query<{ pdf_a3_blob: Buffer | null }>(
    `SELECT pdf_a3_blob FROM billing_invoices WHERE id = $1`, [id]
  );
  if (r.rowCount === 0 || !r.rows[0].pdf_a3_blob) {
    return new Response(JSON.stringify({ error: 'no PDF/A-3 stored for this invoice' }), { status: 404 });
  }
  const client = createSidecarClient(sidecarBaseUrlFromEnv());
  const result = await client.validate({ pdf: r.rows[0].pdf_a3_blob });
  await pool.query(
    `UPDATE billing_invoices SET einvoice_validated_at = now(), einvoice_validation_report = $1 WHERE id = $2`,
    [result, id]
  );
  return new Response(JSON.stringify(result), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};
```

- [ ] **Step 2: Commit**

```bash
git add 'website/src/pages/api/admin/billing/[id]/validate.ts'
git commit -m "feat(einvoice): POST /api/admin/billing/:id/validate (sidecar revalidation)"
```

---

## Task 19: Email send — attach standalone XRechnung XML when present

**Files:**
- Modify: `website/src/pages/api/admin/billing/[id]/send.ts`

- [ ] **Step 1: Locate the email-attachment construction**

Run: `grep -n "attachments\|attach\|filename" 'website/src/pages/api/admin/billing/[id]/send.ts' | head`

- [ ] **Step 2: Add the conditional XRechnung attachment**

Where the existing PDF attachment is built, add immediately after it:

```ts
const draftRow = await pool.query<{ number: string; pdf_a3_blob: Buffer | null; xrechnung_xml: string | null }>(
  `SELECT number, pdf_a3_blob, xrechnung_xml FROM billing_invoices WHERE id = $1`, [id]
);

// existing PDF attach uses draftRow.rows[0].pdf_a3_blob (preferred) or fallback path

if (draftRow.rows[0].xrechnung_xml) {
  attachments.push({
    filename: `xrechnung-${draftRow.rows[0].number}.xml`,
    content: Buffer.from(draftRow.rows[0].xrechnung_xml, 'utf8'),
    contentType: 'application/xml',
  });
}
```

(Match the field shape your `email.ts` mailer uses — `content` may be a Buffer or base64 string.)

- [ ] **Step 3: Run send-flow tests**

Run: `cd website && npx vitest run src/pages/api/admin/billing`
Expected: existing tests still pass; if a test asserted exactly N attachments, update it.

- [ ] **Step 4: Commit**

```bash
git add 'website/src/pages/api/admin/billing/[id]/send.ts'
git commit -m "feat(einvoice): email send attaches XRechnung XML when leitweg_id set"
```

---

## Task 20: Admin form — Leitweg-ID field on invoice + customer

**Files:**
- Modify: customer edit form (find with `grep -rn "billing_customers" website/src/pages/admin --include="*.astro" --include="*.svelte"`)
- Modify: invoice draft edit form (find with `grep -rn "billing_invoices" website/src/pages/admin --include="*.astro" --include="*.svelte"`)
- Modify: API endpoint that saves customer/invoice drafts

- [ ] **Step 1: Add input on the customer form**

```html
<label>
  Leitweg-ID (B2G, optional)
  <input type="text" name="default_leitweg_id" value={customer.default_leitweg_id ?? ''}
         pattern="^\d{2,12}(-\d{1,30})?(-\d{1,3})?$"
         title="Format: 04011000-1234512345-67">
</label>
```

- [ ] **Step 2: Add input on the invoice draft form**

```html
<label>
  Leitweg-ID (überschreibt Kunden-Default)
  <input type="text" name="leitweg_id" value={invoice.leitweg_id ?? ''}
         pattern="^\d{2,12}(-\d{1,30})?(-\d{1,3})?$">
</label>
```

- [ ] **Step 3: Persist in the save endpoints**

```ts
const leitwegId = (form.get('leitweg_id') as string | null)?.trim() || null;
// include in UPDATE billing_invoices SET ... leitweg_id = $X
const defaultLeitwegId = (form.get('default_leitweg_id') as string | null)?.trim() || null;
// include in UPDATE billing_customers SET ... default_leitweg_id = $X
```

When creating a new invoice, pre-fill from `customer.default_leitweg_id` if the form value is empty.

- [ ] **Step 4: Smoke test in dev**

Open the admin UI, set a Leitweg-ID on a customer, create a new invoice for them, confirm it pre-fills.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/admin website/src/pages/api/admin
git commit -m "feat(einvoice): admin UI + persistence for Leitweg-ID (customer + invoice)"
```

---

## Task 21: BATS integration test — sidecar /embed and /validate

**Files:**
- Create: `tests/integration/einvoice-sidecar.bats`
- Modify: `tests/runner.sh`

- [ ] **Step 1: Create the BATS test**

```bash
#!/usr/bin/env bats
# tests/integration/einvoice-sidecar.bats — FA-30

@test "FA-30.1: einvoice-sidecar Service is reachable" {
  run kubectl -n workspace get svc einvoice-sidecar -o jsonpath='{.spec.clusterIP}'
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "FA-30.2: /embed returns PDF/A-3 with factur-x attachment" {
  PDF_B64=$(base64 -w0 website/test/fixtures/einvoice/sample.pdf)
  XML_B64=$(base64 -w0 website/test/fixtures/einvoice/regelbesteuerung-19.cii.xml)
  RESPONSE=$(kubectl -n workspace run curl-embed --image=curlimages/curl --rm -i --restart=Never --quiet -- \
    -s -X POST http://einvoice-sidecar/embed \
    -H 'Content-Type: application/json' \
    -d "{\"pdf\":\"$PDF_B64\",\"xml\":\"$XML_B64\"}")
  echo "$RESPONSE" | jq -r '.pdf' | base64 -d > /tmp/out.pdf
  run head -c 4 /tmp/out.pdf
  [ "$output" = "%PDF" ]
  run grep -c "factur-x.xml" /tmp/out.pdf
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "FA-30.3: /validate returns ok=true for golden output" {
  PDF_B64=$(base64 -w0 /tmp/out.pdf)
  RESPONSE=$(kubectl -n workspace run curl-validate --image=curlimages/curl --rm -i --restart=Never --quiet -- \
    -s -X POST http://einvoice-sidecar/validate \
    -H 'Content-Type: application/json' \
    -d "{\"pdf\":\"$PDF_B64\"}")
  run jq -r '.ok' <<< "$RESPONSE"
  [ "$output" = "true" ]
}
```

- [ ] **Step 2: Register `FA-30` in `tests/runner.sh`**

Find the test ID registry block in `tests/runner.sh` and add `FA-30` pointing to `tests/integration/einvoice-sidecar.bats`. Match the existing registration style.

- [ ] **Step 3: Run the test against dev cluster**

Run: `./tests/runner.sh local FA-30`
Expected: 3/3 pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/einvoice-sidecar.bats tests/runner.sh
git commit -m "test(einvoice): FA-30 BATS integration test for sidecar embed+validate"
```

---

## Task 22: Feature flag rollout to dev → mentolder → korczewski

**Files:**
- Modify: `environments/schema.yaml`, `environments/dev.yaml`, `environments/mentolder.yaml`, `environments/korczewski.yaml`

- [ ] **Step 1: Add flag to schema**

In `environments/schema.yaml`, under `env_vars:`:

```yaml
EINVOICE_SIDECAR_ENABLED:
  description: "Enable Mustangproject sidecar for PDF/A-3 + factur-x.xml embedding"
  required: false
  default: "false"
EINVOICE_SIDECAR_URL:
  description: "Cluster URL for the einvoice-sidecar"
  required: false
  default: "http://einvoice-sidecar.workspace.svc.cluster.local"
```

- [ ] **Step 2: Set `EINVOICE_SIDECAR_ENABLED=true` in `environments/dev.yaml`**

```yaml
env_vars:
  EINVOICE_SIDECAR_ENABLED: "true"
```

Leave `mentolder.yaml` and `korczewski.yaml` at `false` for now.

- [ ] **Step 3: Validate environments**

Run: `task env:validate:all`
Expected: all pass.

- [ ] **Step 4: Deploy dev**

Run: `ENV=dev task workspace:deploy`
Then create a test invoice end-to-end:

```bash
psql "$DATABASE_URL" -c "SELECT id, octet_length(pdf_a3_blob), einvoice_validated_at FROM billing_invoices ORDER BY created_at DESC LIMIT 1;"
```
Expected: `pdf_a3_blob` size > 0; `einvoice_validated_at` is recent.

- [ ] **Step 5: After two weeks of clean dev, repeat for mentolder, then korczewski**

For each prod env:
1. Build + push the sidecar image to your registry (or use ArgoCD image override).
2. Update `k3d/einvoice-sidecar.yaml` `image:` to the registry tag.
3. Set `EINVOICE_SIDECAR_ENABLED: "true"` in `environments/<env>.yaml`.
4. `ENV=<env> task workspace:deploy`.
5. Watch validation reports for two weeks before moving to the next env.

- [ ] **Step 6: Commit**

```bash
git add environments/schema.yaml environments/dev.yaml
git commit -m "feat(einvoice): enable EINVOICE_SIDECAR_ENABLED in dev"
```

---

## Task 23: Deprecate legacy `zugferd.ts`

**Files:**
- Create: `website/src/lib/einvoice/legacy-seller.ts`
- Modify: `website/src/lib/zugferd.ts`
- Modify: `website/src/pages/api/billing/invoice/[id]/zugferd.ts`

This task only runs **after Task 22 step 5 is complete on both prod clusters AND two weeks of clean validation reports.**

- [ ] **Step 1: Move `sellerConfigFromEnv` body**

Create `website/src/lib/einvoice/legacy-seller.ts`:

```ts
export interface LegacySellerConfig {
  name: string; address: string; postalCode: string; city: string; country: string; vatId: string;
}

export function sellerConfigFromEnv(): LegacySellerConfig {
  return {
    name:       process.env.SELLER_NAME        || process.env.BRAND_NAME || 'Unbekannt',
    address:    process.env.SELLER_ADDRESS     || '',
    postalCode: process.env.SELLER_POSTAL_CODE || '',
    city:       process.env.SELLER_CITY        || '',
    country:    process.env.SELLER_COUNTRY     || 'DE',
    vatId:      process.env.SELLER_VAT_ID      || '',
  };
}
```

- [ ] **Step 2: Replace `zugferd.ts` with shim**

```ts
// website/src/lib/zugferd.ts
// DEPRECATED: kept as a one-release shim. Delete after the next minor bump.
import { generateFacturX } from './einvoice/factur-x';
import type { InvoiceInput } from './einvoice/types';

export { sellerConfigFromEnv } from './einvoice/legacy-seller';
export type { LegacySellerConfig as ZugferdSellerConfig } from './einvoice/legacy-seller';

export function generateZugferdXml(): string {
  throw new Error('generateZugferdXml is deprecated. Use generateFacturX from ./einvoice/factur-x.ts.');
}

export function generateZugferdXmlFromNative(input: InvoiceInput): string {
  return generateFacturX(input);
}
```

- [ ] **Step 3: Update legacy XML route to serve from DB**

In `website/src/pages/api/billing/invoice/[id]/zugferd.ts`, replace the body with:

```ts
import type { APIRoute } from 'astro';
import { pool } from '../../../../../lib/website-db';

export const GET: APIRoute = async ({ params }) => {
  const r = await pool.query<{ factur_x_xml: string | null; number: string }>(
    `SELECT factur_x_xml, number FROM billing_invoices WHERE id = $1`, [params.id]
  );
  if (r.rowCount === 0 || !r.rows[0].factur_x_xml) return new Response('not found', { status: 404 });
  return new Response(r.rows[0].factur_x_xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml',
      'content-disposition': `attachment; filename="factur-x-${r.rows[0].number}.xml"`,
    },
  });
};
```

- [ ] **Step 4: Run all unit tests**

Run: `cd website && npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/zugferd.ts website/src/lib/einvoice/legacy-seller.ts 'website/src/pages/api/billing/invoice/[id]/zugferd.ts'
git commit -m "refactor(einvoice): deprecate zugferd.ts as re-export shim; serve factur-x from DB"
```

---

## Task 24: Documentation update

**Files:**
- Create: `k3d/docs-content/einvoice.md`
- Modify: docsify nav (e.g. `k3d/docs-content/_sidebar.md` or whichever index file your docs use)

- [ ] **Step 1: Write `einvoice.md`**

Cover: how PDF/A-3 + ZUGFeRD is generated, when XRechnung is produced, how to set Leitweg-ID, how to validate an invoice, how to roll out to a new env (`task einvoice-sidecar:build/import` + flag), troubleshooting (`task einvoice-sidecar:logs`, common Mustangproject error messages).

- [ ] **Step 2: Deploy docs**

Run: `task docs:deploy ENV=dev && task docs:restart ENV=dev`
Verify at the docs URL.

- [ ] **Step 3: Commit**

```bash
git add k3d/docs-content/einvoice.md k3d/docs-content/_sidebar.md
git commit -m "docs(einvoice): how to issue, validate, and roll out e-invoices"
```

---

## Task 25: End-to-end verification + CI green

- [ ] **Step 1: Run targeted e-invoice unit tests**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run src/lib/einvoice/cii.test.ts src/lib/einvoice/factur-x.test.ts src/lib/einvoice/xrechnung.test.ts src/lib/einvoice/sidecar-client.test.ts
```

Expected: all e-invoice tests pass.

- [ ] **Step 2: Run the full website test suite**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run
```

Expected: no regressions outside the new e-invoice modules.

- [ ] **Step 3: Build the website**

```bash
cd /home/patrick/Bachelorprojekt/website
npx astro build
```

Expected: Astro build succeeds without TypeScript errors.

- [ ] **Step 4: Validate Kubernetes manifests**

```bash
cd /home/patrick/Bachelorprojekt
task workspace:validate
```

Expected: rendered manifests include `einvoice-sidecar` and validation exits 0.

- [ ] **Step 5: Run the new integration test**

```bash
cd /home/patrick/Bachelorprojekt
./tests/runner.sh local FA-30
```

Expected: `FA-30` passes end-to-end against the dev cluster.

- [ ] **Step 6: Manual smoke test**

Verify in dev:
- Create or finalize one invoice without Leitweg-ID: PDF is still issued and `factur_x_xml` is stored.
- Create or finalize one invoice with Leitweg-ID: `xrechnung_xml` is stored too.
- Download `/api/billing/invoice/:id/zugferd` and `/api/billing/invoice/:id/xrechnung.xml` and confirm both return XML.
- Trigger `/api/admin/billing/:id/validate` and confirm `ok: true` or only non-fatal warnings.
- Send the invoice email and confirm the XML attachment is present for the Leitweg-ID case.

- [ ] **Step 7: Final status check**

```bash
cd /home/patrick/Bachelorprojekt
git status
git log --oneline -8
```

Expected: all planned commits are present and no unexpected files remain unstaged.

---

## Task 26: Push branch + open PR

- [ ] **Step 1: Confirm feature branch**

```bash
cd /home/patrick/Bachelorprojekt
git branch --show-current
git status
```

Expected: branch name follows `feature/*`, `fix/*`, or `chore/*` and contains only the intended e-invoice work.

- [ ] **Step 2: Push branch**

```bash
cd /home/patrick/Bachelorprojekt
git push -u origin <branch-name>
```

- [ ] **Step 3: Open PR**

```bash
gh pr create --title "feat(billing): PDF/A-3 ZUGFeRD + XRechnung sidecar output" --body "$(cat <<'EOF'
## Summary
- add a shared CII EN 16931 generator plus Factur-X and XRechnung profilers
- add a Java Mustangproject sidecar for PDF/A-3 embedding and validation
- store Factur-X XML, optional XRechnung XML, PDF/A-3 bytes, and validation reports on invoices
- add admin and download APIs for XRechnung retrieval and revalidation
- add Leitweg-ID persistence, rollout flags, docs, and FA-30 integration coverage

Implements Plan C (`2026-04-28-zugferd-xrechnung-output-sidecar.md`) for the chosen sidecar-based e-invoice output architecture.

## Test plan
- [ ] `cd website && npx vitest run src/lib/einvoice/cii.test.ts src/lib/einvoice/factur-x.test.ts src/lib/einvoice/xrechnung.test.ts src/lib/einvoice/sidecar-client.test.ts`
- [ ] `cd website && npx vitest run`
- [ ] `cd website && npx astro build`
- [ ] `cd /home/patrick/Bachelorprojekt && task workspace:validate`
- [ ] `cd /home/patrick/Bachelorprojekt && ./tests/runner.sh local FA-30`
- [ ] Manual: finalize one invoice with Leitweg-ID and verify PDF/A-3, stored XML blobs, and email attachments

🤖 Generated with Claude Code
EOF
)"
```

---

## Self-review checklist

1. **Spec coverage:** every section of `2026-04-28-zugferd-xrechnung-output-design.md` maps to ≥1 task — Architecture (Tasks 9–14), Components (1–8, 17–19, 23), Data flow (15, 19), Error handling (15, 18), Testing (3–8, 14, 16, 21), Migration/rollout (22, 23). ✓
2. **No placeholders:** every step has runnable code or commands; no "TBD" or "implement appropriate handling". ✓
3. **Type consistency:** `InvoiceInput`, `SellerConfig`, `BuyerConfig`, `EmbedResult`, `ValidateResult`, `SidecarUnavailableError`, `SidecarValidationError`, `generateCII`, `generateFacturX`, `generateXRechnung`, `createSidecarClient`, `sidecarBaseUrlFromEnv`, `embedFacturX` — names used consistently across all tasks. ✓
4. **TDD ordering:** Tasks 3, 7, 8, 14 follow failing-test → impl → passing-test → commit. Tasks 4, 5, 6 are golden-output additions on top of the existing implementation. ✓
5. **Frequent commits:** every task ends with a commit; no task does more than one cohesive thing. ✓
