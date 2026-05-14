---
title: Plan C — ZUGFeRD/XRechnung Output Implementation Plan
domains: [db]
status: completed
pr_number: null
---

# Plan C — ZUGFeRD/XRechnung Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erweitere die bestehende Factur-X-Minimum-Erzeugung zu einem konformen E-Rechnungs-Output mit (1) XRechnung 3.0 CIUS in beiden Syntaxen (UBL 2.1 Invoice + UN/CEFACT CII D16B), Leitweg-ID-Handling für B2G, vollständigem BT-/BG-Mapping; und (2) Einbettung als `factur-x.xml` in PDF/A-3 mit korrekter XMP-Metadata, validiert über Mustangproject.

**Architecture:** Drei Layer — Profile-Dispatcher (`einvoice-profile.ts`) wählt zwischen `factur-x-minimum`, `xrechnung-cii`, `xrechnung-ubl`. Generatoren in `zugferd.ts` (CII) und neu `xrechnung-ubl.ts`. PDF-Embedding via `pdf-a3-embed.ts` (pdf-lib post-processor) wird nach PDFKit aufgerufen und legt `factur-x.xml` mit `/AFRelationship /Alternative` und Factur-X-XMP-Extension-Schema im PDF/A-3-Output-Intent ab. Validation läuft in Tests via Mustangproject CLI in einem Docker-Sidecar (kein Runtime-Dependency).

**Tech Stack:** TypeScript, Astro SSR (Node), `pdfkit ^0.18.0` (vorhanden), `pdf-lib ^1.17.1` (neu), Vitest, PostgreSQL, Mustangproject CLI 2.x via Docker (`ghcr.io/zugferd/mustangproject` o. ä. in Tests).

---

## Scope-Hinweis

Dieser Plan setzt voraus, dass die SEPA-Billing-Basis (`docs/superpowers/plans/2026-04-27-sepa-billing-steuer.md`, Subsystem A) gemerged ist. Konkret existieren bereits:

- `website/src/lib/zugferd.ts` mit `generateZugferdXml` und `generateZugferdXmlFromNative` (Factur-X 1p0 Minimum)
- `website/src/lib/invoice-pdf.ts` mit `generateInvoicePdf` (PDFKit, **ohne** Embedding)
- `billing_customers`-Tabelle und `invoices.zugferd_xml TEXT`-Spalte
- API-Route `website/src/pages/api/billing/invoice/[id]/zugferd.ts` (liefert XML standalone)

Der Plan **erweitert** diese Dateien; er ersetzt sie nicht.

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `website/src/lib/leitweg.ts` (neu) | Leitweg-ID-Validierung (Syntax + Prüfziffer) |
| `website/src/lib/einvoice-profile.ts` (neu) | Profile-Dispatcher: Auswahl `factur-x-minimum` ⇆ `xrechnung-cii` ⇆ `xrechnung-ubl` |
| `website/src/lib/zugferd.ts` (modify) | XRechnung CIUS auf CII-Basis: vollständiges BT-/BG-Mapping, Leitweg-ID als BT-10 |
| `website/src/lib/xrechnung-ubl.ts` (neu) | UBL 2.1 Invoice mit XRechnung-3.0-CIUS-CustomizationID |
| `website/src/lib/pdf-a3-embed.ts` (neu) | pdf-lib-Postprozessor: PDFKit-Output → PDF/A-3b mit `factur-x.xml`, sRGB-OutputIntent, XMP |
| `website/src/lib/invoice-pdf.ts` (modify) | ruft `generateZugferdXmlFromNative` + `embedFacturXIntoPdfA3` auf |
| `website/src/pages/api/billing/invoice/[id]/zugferd.ts` (modify) | `?profile=…` Query-Param, Content-Type/Filename pro Profil |
| `website/src/lib/native-billing.ts` (modify) | `Customer.leitwegId` Feld + Persistierung |
| `website/src/lib/website-db.ts` (modify) | `ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS leitweg_id` |
| `website/src/components/admin/CustomerForm.svelte` (modify) | Leitweg-ID-Input mit Live-Validierung |
| `website/tests/fixtures/mustang.sh` (neu) | Hilfsskript: Mustang-CLI in Docker für Validation |
| `Taskfile.yml` (modify) | `task billing:validate-einvoice -- <pfad>` |
| `k3d/docs-content/adminhandbuch.md` (modify) | B2G-Workflow, Leitweg-ID-Hinweis |

---

## Task 1: DB-Migration — `leitweg_id` auf `billing_customers`

**Files:**
- Modify: `website/src/lib/website-db.ts:3027` (Schema in `initBillingTables`)

- [ ] **Step 1: Lokalisiere `CREATE TABLE IF NOT EXISTS billing_customers`-Block**

Run: `grep -n "billing_customers" website/src/lib/website-db.ts`
Erwartet: Treffer um Zeile 3027 (Tabellen-DDL) und ca. eine Idempotenz-Sektion mit `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.

- [ ] **Step 2: Füge `ALTER TABLE`-Zeile in der Idempotenz-Sektion hinzu**

In `website/src/lib/website-db.ts`, direkt nach dem letzten existierenden `ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS …`-Statement (oder am Ende des `initBillingTables`-Bodys vor dem `}`):

```ts
await pool.query(`ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS leitweg_id VARCHAR(46)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_customers_leitweg ON billing_customers(leitweg_id) WHERE leitweg_id IS NOT NULL`);
```

- [ ] **Step 3: Schema-Test schreiben**

Create: `website/src/lib/native-billing.test.ts` — füge in den existierenden `describe('billing_customers schema', …)` (oder neu) hinzu:

```ts
it('hat leitweg_id Spalte (max 46 chars, B2G optional)', async () => {
  await initBillingTables();
  const r = await pool.query(
    `SELECT column_name, character_maximum_length
       FROM information_schema.columns
      WHERE table_name='billing_customers' AND column_name='leitweg_id'`
  );
  expect(r.rows).toHaveLength(1);
  expect(r.rows[0].character_maximum_length).toBe(46);
});
```

- [ ] **Step 4: Test laufen lassen**

Run: `cd website && pnpm vitest run src/lib/native-billing.test.ts -t "leitweg_id"`
Erwartet: PASS (DB-Verbindung muss zur Test-Postgres bestehen — siehe `website/vitest.config.ts`).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/website-db.ts website/src/lib/native-billing.test.ts
git commit -m "feat(billing): add leitweg_id column on billing_customers for B2G"
```

---

## Task 2: Leitweg-ID-Validation-Library

**Files:**
- Create: `website/src/lib/leitweg.ts`
- Create: `website/src/lib/leitweg.test.ts`

- [ ] **Step 1: Failing test schreiben**

Create: `website/src/lib/leitweg.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateLeitwegId, formatLeitwegId } from './leitweg';

describe('validateLeitwegId', () => {
  it('akzeptiert Grobadressierung + Prüfziffer (Bund-Beispiel)', () => {
    expect(validateLeitwegId('991-01234-44').ok).toBe(true);
  });
  it('akzeptiert Grob-Fein-Prüfziffer mit alphanumerischer Feinadresse', () => {
    expect(validateLeitwegId('04011000-1234512345-06').ok).toBe(true);
  });
  it('lehnt ab bei fehlender Prüfziffer', () => {
    expect(validateLeitwegId('991-01234').ok).toBe(false);
  });
  it('lehnt ab bei Länge > 46', () => {
    expect(validateLeitwegId('9'.repeat(47)).ok).toBe(false);
  });
  it('lehnt ab bei nicht-zifferigen Prüfziffern', () => {
    expect(validateLeitwegId('991-01234-AB').ok).toBe(false);
  });
  it('formatLeitwegId trimmt und uppercased Feinadresse', () => {
    expect(formatLeitwegId('  991-abc-12  ')).toBe('991-ABC-12');
  });
});
```

- [ ] **Step 2: Test laufen lassen — soll fehlschlagen**

Run: `cd website && pnpm vitest run src/lib/leitweg.test.ts`
Erwartet: FAIL — `Cannot find module './leitweg'`.

- [ ] **Step 3: `leitweg.ts` implementieren**

Create: `website/src/lib/leitweg.ts`:

```ts
// Leitweg-ID nach Spezifikation der Koordinierungsstelle für IT-Standards (KoSIT) v2.0.2:
// <Grobadressierung>[-<Feinadressierung>]-<Prüfziffer>
//   Grobadressierung: 2..12 Zeichen, [A-Z0-9]
//   Feinadressierung: 0..30 Zeichen, [A-Z0-9._-] (optional, mit eigenem Bindestrich davor)
//   Prüfziffer: genau 2 Ziffern
// Gesamtlänge inkl. Trennstriche: max 46 Zeichen.
const LEITWEG_RE = /^[A-Z0-9]{2,12}(-[A-Z0-9._-]{0,30})?-\d{2}$/;

export interface LeitwegResult { ok: boolean; reason?: string }

export function formatLeitwegId(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateLeitwegId(raw: string | null | undefined): LeitwegResult {
  if (!raw) return { ok: false, reason: 'leer' };
  const v = formatLeitwegId(raw);
  if (v.length > 46) return { ok: false, reason: 'länger als 46 Zeichen' };
  if (!LEITWEG_RE.test(v)) return { ok: false, reason: 'Format ungültig' };
  return { ok: true };
}
```

- [ ] **Step 4: Test laufen lassen — soll passen**

Run: `cd website && pnpm vitest run src/lib/leitweg.test.ts`
Erwartet: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/leitweg.ts website/src/lib/leitweg.test.ts
git commit -m "feat(billing): add Leitweg-ID validation per KoSIT 2.0.2"
```

---

## Task 3: Profile-Dispatcher und gemeinsamer Input-Type

**Files:**
- Create: `website/src/lib/einvoice-profile.ts`
- Create: `website/src/lib/einvoice-profile.test.ts`

- [ ] **Step 1: Failing test schreiben**

Create: `website/src/lib/einvoice-profile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateEInvoiceXml, type EInvoiceProfile } from './einvoice-profile';

const baseInput = {
  invoice: { number: 'RE-2026-0001', issueDate: '2026-04-28', dueDate: '2026-05-12',
             grossAmount: 119, netAmount: 100, taxAmount: 19, taxMode: 'regelbesteuerung' as const,
             taxRate: 19, paymentReference: 'RG2026-0001' },
  lines: [{ description: 'Beratung', quantity: 1, unitPrice: 100, unit: 'HUR' }],
  customer: { name: 'Stadt Beispiel', email: 'rechnungen@beispiel.de', leitwegId: '991-01234-44',
              addressLine1: 'Marktplatz 1', postalCode: '12345', city: 'Beispielstadt', country: 'DE' },
  seller: { name: 'mentolder', address: 'Hauptstr. 1', postalCode: '54321', city: 'Köln',
            country: 'DE', vatId: 'DE123456789', iban: 'DE02120300000000202051', bic: 'BYLADEM1001' },
};

it.each<EInvoiceProfile>(['factur-x-minimum', 'xrechnung-cii', 'xrechnung-ubl'])(
  'erzeugt valides XML für Profil %s', (profile) => {
    const xml = generateEInvoiceXml(profile, baseInput);
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml.length).toBeGreaterThan(500);
  }
);

it('xrechnung-cii enthält XRechnung-3.0-CustomizationID', () => {
  const xml = generateEInvoiceXml('xrechnung-cii', baseInput);
  expect(xml).toContain('urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0');
});

it('xrechnung-ubl ist UBL-Namespace (Invoice-Element)', () => {
  const xml = generateEInvoiceXml('xrechnung-ubl', baseInput);
  expect(xml).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
});

it('lehnt xrechnung-cii ab ohne Leitweg-ID (B2G-Pflicht)', () => {
  const noLeitweg = { ...baseInput, customer: { ...baseInput.customer, leitwegId: undefined } };
  expect(() => generateEInvoiceXml('xrechnung-cii', noLeitweg)).toThrow(/Leitweg-ID/);
});
```

- [ ] **Step 2: Test laufen lassen — soll fehlschlagen**

Run: `cd website && pnpm vitest run src/lib/einvoice-profile.test.ts`
Erwartet: FAIL — Modul existiert nicht.

- [ ] **Step 3: `einvoice-profile.ts` implementieren**

Create: `website/src/lib/einvoice-profile.ts`:

```ts
import { generateZugferdXmlFromNative, generateXRechnungCii, type ZugferdNativeInput } from './zugferd';
import { generateXRechnungUbl } from './xrechnung-ubl';
import { validateLeitwegId } from './leitweg';

export type EInvoiceProfile = 'factur-x-minimum' | 'xrechnung-cii' | 'xrechnung-ubl';

export interface EInvoiceCustomer {
  name: string; email: string;
  addressLine1?: string; postalCode?: string; city?: string; country?: string;
  leitwegId?: string;
}

export interface EInvoiceSeller {
  name: string; address: string; postalCode: string; city: string;
  country: string; vatId: string; iban?: string; bic?: string;
}

export interface EInvoiceLine {
  description: string; quantity: number; unitPrice: number; unit?: string;
}

export interface EInvoiceInput {
  invoice: {
    number: string; issueDate: string; dueDate: string;
    grossAmount: number; netAmount: number; taxAmount: number;
    taxMode: 'kleinunternehmer' | 'regelbesteuerung'; taxRate: number;
    paymentReference?: string;
  };
  lines: EInvoiceLine[];
  customer: EInvoiceCustomer;
  seller: EInvoiceSeller;
}

export function generateEInvoiceXml(profile: EInvoiceProfile, p: EInvoiceInput): string {
  if (profile === 'xrechnung-cii' || profile === 'xrechnung-ubl') {
    const v = validateLeitwegId(p.customer.leitwegId);
    if (!v.ok) {
      throw new Error(`XRechnung verlangt eine gültige Leitweg-ID (BT-10): ${v.reason}`);
    }
  }
  switch (profile) {
    case 'factur-x-minimum':
      return generateZugferdXmlFromNative(p as unknown as ZugferdNativeInput);
    case 'xrechnung-cii':
      return generateXRechnungCii(p);
    case 'xrechnung-ubl':
      return generateXRechnungUbl(p);
  }
}
```

- [ ] **Step 4: Stubs in `zugferd.ts` und `xrechnung-ubl.ts` anlegen damit Imports auflösen**

Modify: `website/src/lib/zugferd.ts` — am Dateiende anhängen:

```ts
import type { EInvoiceInput } from './einvoice-profile';

export function generateXRechnungCii(_p: EInvoiceInput): string {
  throw new Error('not implemented'); // siehe Task 4
}
```

Create: `website/src/lib/xrechnung-ubl.ts`:

```ts
import type { EInvoiceInput } from './einvoice-profile';

export function generateXRechnungUbl(_p: EInvoiceInput): string {
  throw new Error('not implemented'); // siehe Task 5
}
```

- [ ] **Step 5: Tests laufen lassen — Dispatcher-Tests passen, Profil-Tests skippen**

Run: `cd website && pnpm vitest run src/lib/einvoice-profile.test.ts -t "lehnt xrechnung-cii ab"`
Erwartet: PASS. Die anderen Tests werfen `not implemented` und werden in Tasks 4 und 5 grün.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/einvoice-profile.ts website/src/lib/einvoice-profile.test.ts website/src/lib/zugferd.ts website/src/lib/xrechnung-ubl.ts
git commit -m "feat(billing): introduce e-invoice profile dispatcher (Factur-X / XRechnung CII+UBL)"
```

---

## Task 4: XRechnung 3.0 CIUS auf CII-D16B-Basis

**Files:**
- Modify: `website/src/lib/zugferd.ts` (Funktion `generateXRechnungCii` ersetzen)

- [ ] **Step 1: Failing test ergänzen**

Modify: `website/src/lib/einvoice-profile.test.ts` — innerhalb der `describe`-Suite:

```ts
it('xrechnung-cii enthält Pflichtfelder BT-1, BT-2, BT-5, BT-9, BT-10, BT-31, BG-16', () => {
  const xml = generateEInvoiceXml('xrechnung-cii', baseInput);
  expect(xml).toContain('<ram:ID>RE-2026-0001</ram:ID>');                           // BT-1
  expect(xml).toContain('format="102">20260428');                                    // BT-2
  expect(xml).toContain('<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>');   // BT-5
  expect(xml).toContain('format="102">20260512');                                    // BT-9 DueDate
  expect(xml).toContain('<ram:BuyerReference>991-01234-44</ram:BuyerReference>');    // BT-10
  expect(xml).toContain('<ram:ID schemeID="VA">DE123456789</ram:ID>');               // BT-31
  expect(xml).toContain('<ram:IBANID>DE02120300000000202051</ram:IBANID>');          // BG-16 BT-84
});
it('xrechnung-cii Line-Items mappen BT-126/BT-129/BT-131', () => {
  const xml = generateEInvoiceXml('xrechnung-cii', baseInput);
  expect(xml).toContain('<ram:LineID>1</ram:LineID>');                                  // BT-126
  expect(xml).toMatch(/<ram:BilledQuantity unitCode="HUR">1<\/ram:BilledQuantity>/);    // BT-129
  expect(xml).toMatch(/<ram:LineTotalAmount>100\.00<\/ram:LineTotalAmount>/);           // BT-131
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `cd website && pnpm vitest run src/lib/einvoice-profile.test.ts -t "xrechnung-cii"`
Erwartet: FAIL — `not implemented`.

- [ ] **Step 3: `generateXRechnungCii` implementieren**

Modify: `website/src/lib/zugferd.ts` — ersetze den Stub aus Task 3 vollständig durch:

```ts
import type { EInvoiceInput } from './einvoice-profile';

const XR_CII_GUIDELINE =
  'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0';

export function generateXRechnungCii(p: EInvoiceInput): string {
  const isKlein = p.invoice.taxMode === 'kleinunternehmer';
  const currency = 'EUR';
  const fmt2 = (n: number) => n.toFixed(2);
  const dt = (iso: string) => iso.replace(/-/g, '').slice(0, 8);

  const lineXml = p.lines.map((l, i) => {
    const lineNet = fmt2(l.quantity * l.unitPrice);
    const unit = l.unit ?? 'C62';
    return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${i + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${esc(l.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${fmt2(l.unitPrice)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${esc(unit)}">${l.quantity}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${isKlein ? 'E' : 'S'}</ram:CategoryCode>
          <ram:RateApplicablePercent>${isKlein ? '0' : fmt2(p.invoice.taxRate)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${lineNet}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
  }).join('');

  const paymentMeans = p.seller.iban ? `
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:Information>SEPA-Überweisung</ram:Information>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${esc(p.seller.iban)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>${p.seller.bic ? `
        <ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${esc(p.seller.bic)}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>` : '';

  const kleinNote = isKlein ? `
    <ram:IncludedNote>
      <ram:Content>Kein Ausweis der Umsatzsteuer gemäß § 19 UStG.</ram:Content>
    </ram:IncludedNote>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${XR_CII_GUIDELINE}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(p.invoice.number)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${dt(p.invoice.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>${kleinNote}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc(p.customer.leitwegId!)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${esc(p.seller.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(p.seller.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${esc(p.seller.address)}</ram:LineOne>
          <ram:CityName>${esc(p.seller.city)}</ram:CityName>
          <ram:CountryID>${esc(p.seller.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(p.seller.vatId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(p.customer.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(p.customer.postalCode ?? '')}</ram:PostcodeCode>
          <ram:LineOne>${esc(p.customer.addressLine1 ?? '')}</ram:LineOne>
          <ram:CityName>${esc(p.customer.city ?? '')}</ram:CityName>
          <ram:CountryID>${esc(p.customer.country ?? 'DE')}</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>${p.invoice.paymentReference ? `
      <ram:PaymentReference>${esc(p.invoice.paymentReference)}</ram:PaymentReference>` : ''}
      <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>${paymentMeans}
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${isKlein ? '0.00' : fmt2(p.invoice.taxAmount)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${isKlein ? fmt2(p.invoice.grossAmount) : fmt2(p.invoice.netAmount)}</ram:BasisAmount>
        <ram:CategoryCode>${isKlein ? 'E' : 'S'}</ram:CategoryCode>${isKlein ? `
        <ram:ExemptionReasonCode>VATEX-EU-O</ram:ExemptionReasonCode>` : ''}
        <ram:RateApplicablePercent>${isKlein ? '0' : fmt2(p.invoice.taxRate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${dt(p.invoice.dueDate)}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${fmt2(p.invoice.netAmount)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${isKlein ? fmt2(p.invoice.grossAmount) : fmt2(p.invoice.netAmount)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${currency}">${isKlein ? '0.00' : fmt2(p.invoice.taxAmount)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${fmt2(p.invoice.grossAmount)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${fmt2(p.invoice.grossAmount)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}
```

- [ ] **Step 4: Tests laufen lassen — alle CII-Tests grün**

Run: `cd website && pnpm vitest run src/lib/einvoice-profile.test.ts`
Erwartet: alle Tests außer `xrechnung-ubl` PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/zugferd.ts website/src/lib/einvoice-profile.test.ts
git commit -m "feat(billing): generate XRechnung 3.0 CIUS in CII D16B syntax with full BT/BG mapping + Leitweg-ID"
```

---

## Task 5: XRechnung 3.0 CIUS in UBL 2.1

**Files:**
- Modify: `website/src/lib/xrechnung-ubl.ts`

- [ ] **Step 1: Test ergänzen**

Modify: `website/src/lib/einvoice-profile.test.ts` — füge hinzu:

```ts
it('xrechnung-ubl mappt BT-1/BT-2/BT-5/BT-9/BT-10/BT-31 + IBAN', () => {
  const xml = generateEInvoiceXml('xrechnung-ubl', baseInput);
  expect(xml).toContain('<cbc:ID>RE-2026-0001</cbc:ID>');
  expect(xml).toContain('<cbc:IssueDate>2026-04-28</cbc:IssueDate>');
  expect(xml).toContain('<cbc:DueDate>2026-05-12</cbc:DueDate>');
  expect(xml).toContain('<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>');
  expect(xml).toContain('<cbc:BuyerReference>991-01234-44</cbc:BuyerReference>');
  expect(xml).toContain('<cbc:CompanyID schemeID="VAT">DE123456789</cbc:CompanyID>');
  expect(xml).toContain('<cbc:ID>DE02120300000000202051</cbc:ID>');
});
it('xrechnung-ubl CustomizationID ist XRechnung 3.0', () => {
  const xml = generateEInvoiceXml('xrechnung-ubl', baseInput);
  expect(xml).toMatch(/<cbc:CustomizationID>urn:cen\.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3\.0<\/cbc:CustomizationID>/);
});
```

- [ ] **Step 2: Test laufen lassen — soll fehlschlagen**

Run: `cd website && pnpm vitest run src/lib/einvoice-profile.test.ts -t "xrechnung-ubl"`
Erwartet: FAIL — `not implemented`.

- [ ] **Step 3: UBL-Generator implementieren**

Modify: `website/src/lib/xrechnung-ubl.ts` — ersetze die Datei vollständig durch:

```ts
import type { EInvoiceInput } from './einvoice-profile';

const XR_UBL_CUSTOMIZATION =
  'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0';
const XR_UBL_PROFILE = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt2 = (n: number) => n.toFixed(2);

export function generateXRechnungUbl(p: EInvoiceInput): string {
  const isKlein = p.invoice.taxMode === 'kleinunternehmer';
  const taxCat = isKlein ? 'E' : 'S';
  const taxRate = isKlein ? 0 : p.invoice.taxRate;
  const currency = 'EUR';

  const lineXml = p.lines.map((l, i) => `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(l.unit ?? 'C62')}">${l.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${fmt2(l.quantity * l.unitPrice)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(l.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${taxCat}</cbc:ID>
        <cbc:Percent>${fmt2(taxRate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${fmt2(l.unitPrice)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`).join('');

  const paymentMeans = p.seller.iban ? `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>${p.invoice.paymentReference ? `
    <cbc:PaymentID>${esc(p.invoice.paymentReference)}</cbc:PaymentID>` : ''}
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(p.seller.iban)}</cbc:ID>${p.seller.bic ? `
      <cac:FinancialInstitutionBranch>
        <cbc:ID>${esc(p.seller.bic)}</cbc:ID>
      </cac:FinancialInstitutionBranch>` : ''}
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice
  xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>${XR_UBL_CUSTOMIZATION}</cbc:CustomizationID>
  <cbc:ProfileID>${XR_UBL_PROFILE}</cbc:ProfileID>
  <cbc:ID>${esc(p.invoice.number)}</cbc:ID>
  <cbc:IssueDate>${p.invoice.issueDate}</cbc:IssueDate>
  <cbc:DueDate>${p.invoice.dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>${isKlein ? `
  <cbc:Note>Kein Ausweis der Umsatzsteuer gemäß § 19 UStG.</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${esc(p.customer.leitwegId!)}</cbc:BuyerReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(p.seller.address)}</cbc:StreetName>
        <cbc:CityName>${esc(p.seller.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(p.seller.postalCode)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(p.seller.country)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID schemeID="VAT">${esc(p.seller.vatId)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(p.seller.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(p.customer.addressLine1 ?? '')}</cbc:StreetName>
        <cbc:CityName>${esc(p.customer.city ?? '')}</cbc:CityName>
        <cbc:PostalZone>${esc(p.customer.postalCode ?? '')}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(p.customer.country ?? 'DE')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(p.customer.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>${paymentMeans}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${isKlein ? '0.00' : fmt2(p.invoice.taxAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${isKlein ? fmt2(p.invoice.grossAmount) : fmt2(p.invoice.netAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${isKlein ? '0.00' : fmt2(p.invoice.taxAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${taxCat}</cbc:ID>
        <cbc:Percent>${fmt2(taxRate)}</cbc:Percent>${isKlein ? `
        <cbc:TaxExemptionReasonCode>VATEX-EU-O</cbc:TaxExemptionReasonCode>` : ''}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${fmt2(p.invoice.netAmount)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${fmt2(p.invoice.netAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${fmt2(p.invoice.grossAmount)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${fmt2(p.invoice.grossAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lineXml}
</Invoice>`;
}
```

- [ ] **Step 4: Tests laufen lassen — alles grün**

Run: `cd website && pnpm vitest run src/lib/einvoice-profile.test.ts`
Erwartet: alle Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/xrechnung-ubl.ts website/src/lib/einvoice-profile.test.ts
git commit -m "feat(billing): generate XRechnung 3.0 CIUS in UBL 2.1 syntax"
```

---

## Task 6: Mustangproject-Validation-Helper für Tests

**Files:**
- Create: `website/tests/fixtures/mustang.sh`
- Create: `website/src/lib/mustang.test-helper.ts`

- [ ] **Step 1: Hilfsskript schreiben**

Create: `website/tests/fixtures/mustang.sh`:

```bash
#!/usr/bin/env bash
# Validates an e-invoice (XML or ZUGFeRD-PDF) using Mustangproject CLI in Docker.
# Usage: mustang.sh validate <path-to-file>
set -euo pipefail
ACTION="${1:-validate}"
FILE="${2:?usage: mustang.sh <action> <file>}"
DIR="$(cd "$(dirname "$FILE")" && pwd)"
NAME="$(basename "$FILE")"
docker run --rm -v "$DIR:/work" -w /work \
  ghcr.io/zugferd/mustangproject:2.16.2 \
  --action "$ACTION" --source "/work/$NAME" --no-notices
```

- [ ] **Step 2: Skript ausführbar machen + smoke-test**

Run:
```bash
chmod +x website/tests/fixtures/mustang.sh
echo '<?xml version="1.0"?><foo/>' > /tmp/bad.xml
website/tests/fixtures/mustang.sh validate /tmp/bad.xml || echo "OK — Mustang lehnt invalides XML ab"
```
Erwartet: Mustang gibt ≥1 Validierungsfehler aus, Skript exit ≠ 0, `OK — …` wird gedruckt. Falls Docker-Image nicht erreichbar: prüfe Tag bei `https://github.com/ZUGFeRD/mustangproject/pkgs/container/mustangproject` und passe Version an.

- [ ] **Step 3: Test-Helper schreiben**

Create: `website/src/lib/mustang.test-helper.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface MustangResult { ok: boolean; output: string }

export function validateWithMustang(content: Buffer | string, ext: 'xml' | 'pdf'): MustangResult {
  const dir = mkdtempSync(join(tmpdir(), 'mustang-'));
  const file = join(dir, `invoice.${ext}`);
  writeFileSync(file, content);
  try {
    const out = execFileSync('website/tests/fixtures/mustang.sh', ['validate', file], { encoding: 'utf8' });
    return { ok: true, output: out };
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string };
    return { ok: false, output: String(err.stdout ?? '') + String(err.stderr ?? '') + (err.message ?? '') };
  }
}

export const mustangAvailable = (() => {
  try {
    execFileSync('docker', ['version'], { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();
```

- [ ] **Step 4: Validierungs-Test gegen alle drei Profile**

Modify: `website/src/lib/einvoice-profile.test.ts` — am Ende anhängen:

```ts
import { validateWithMustang, mustangAvailable } from './mustang.test-helper';

describe.skipIf(!mustangAvailable)('Mustang validation', () => {
  it('factur-x-minimum XML ist Mustang-valide', () => {
    const xml = generateEInvoiceXml('factur-x-minimum', baseInput);
    const r = validateWithMustang(xml, 'xml');
    if (!r.ok) console.error(r.output);
    expect(r.ok).toBe(true);
  });
  it('xrechnung-cii XML ist Mustang-valide', () => {
    const xml = generateEInvoiceXml('xrechnung-cii', baseInput);
    const r = validateWithMustang(xml, 'xml');
    if (!r.ok) console.error(r.output);
    expect(r.ok).toBe(true);
  });
  it('xrechnung-ubl XML ist Mustang-valide', () => {
    const xml = generateEInvoiceXml('xrechnung-ubl', baseInput);
    const r = validateWithMustang(xml, 'xml');
    if (!r.ok) console.error(r.output);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 5: Tests laufen lassen**

Run: `cd website && pnpm vitest run src/lib/einvoice-profile.test.ts`
Erwartet: alle Tests PASS. Bei `it skipped`: Docker fehlt — dokumentieren, weitermachen.

- [ ] **Step 6: Commit**

```bash
git add website/tests/fixtures/mustang.sh website/src/lib/mustang.test-helper.ts website/src/lib/einvoice-profile.test.ts
git commit -m "test(billing): validate all 3 e-invoice profiles via Mustangproject"
```

---

## Task 7: API-Route ?profile=…-Parameter

**Files:**
- Modify: `website/src/pages/api/billing/invoice/[id]/zugferd.ts`

- [ ] **Step 1: Failing test schreiben (HTTP-Level)**

Create: `website/src/pages/api/billing/invoice/[id]/zugferd.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { GET } from './zugferd';

vi.mock('../../../../../lib/auth', () => ({
  getSession: () => ({ user: { is_admin: true } }),
  isAdmin: () => true,
}));
vi.mock('../../../../../lib/native-billing', () => ({
  getInvoiceForEInvoice: async (id: string) => id === 'inv-1' ? {
    invoice: { number: 'RE-1', issueDate: '2026-04-28', dueDate: '2026-05-12',
               grossAmount: 119, netAmount: 100, taxAmount: 19,
               taxMode: 'regelbesteuerung', taxRate: 19, paymentReference: 'RG1' },
    lines: [{ description: 'Beratung', quantity: 1, unitPrice: 100, unit: 'HUR' }],
    customer: { name: 'X', email: 'x@y.de', leitwegId: '991-01234-44',
                addressLine1: 'A', postalCode: '1', city: 'B', country: 'DE' },
    seller: { name: 'mentolder', address: 'H1', postalCode: '54321', city: 'Köln',
              country: 'DE', vatId: 'DE123456789', iban: 'DE02120300000000202051' },
  } : null,
}));

const req = (url: string) => ({ request: new Request(url, { headers: { cookie: '' } }), params: { id: 'inv-1' } } as never);

it('default = factur-x-minimum', async () => {
  const r = await GET(req('https://x/?'));
  expect(r.headers.get('Content-Disposition')).toContain('factur-x-RE-1.xml');
});
it('?profile=xrechnung-cii', async () => {
  const r = await GET(req('https://x/?profile=xrechnung-cii'));
  expect(r.headers.get('Content-Disposition')).toContain('xrechnung-cii-RE-1.xml');
  expect(await r.text()).toContain('xrechnung_3.0');
});
it('?profile=xrechnung-ubl', async () => {
  const r = await GET(req('https://x/?profile=xrechnung-ubl'));
  expect(await r.text()).toContain('<Invoice');
});
it('lehnt unbekanntes Profil ab', async () => {
  const r = await GET(req('https://x/?profile=garbage'));
  expect(r.status).toBe(400);
});
```

- [ ] **Step 2: Test laufen lassen — soll fehlschlagen**

Run: `cd website && pnpm vitest run "src/pages/api/billing/invoice/\[id\]/zugferd.test.ts"`
Erwartet: FAIL — alte Route nutzt `getFullInvoice` aus `stripe-billing` und hat kein Profile-Param.

- [ ] **Step 3: API-Route umschreiben**

Modify: `website/src/pages/api/billing/invoice/[id]/zugferd.ts` — ersetze die ganze Datei:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getInvoiceForEInvoice } from '../../../../../lib/native-billing';
import { generateEInvoiceXml, type EInvoiceProfile } from '../../../../../lib/einvoice-profile';

const PROFILES: Record<EInvoiceProfile, { contentType: string; prefix: string }> = {
  'factur-x-minimum': { contentType: 'application/xml; charset=utf-8',  prefix: 'factur-x' },
  'xrechnung-cii':    { contentType: 'application/xml; charset=utf-8',  prefix: 'xrechnung-cii' },
  'xrechnung-ubl':    { contentType: 'application/xml; charset=utf-8',  prefix: 'xrechnung-ubl' },
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json(401, { error: 'Unauthorized' });
  const id = params.id;
  if (!id) return json(400, { error: 'Missing invoice ID' });

  const url = new URL(request.url);
  const profileParam = (url.searchParams.get('profile') ?? 'factur-x-minimum') as EInvoiceProfile;
  if (!(profileParam in PROFILES)) return json(400, { error: `Unknown profile: ${profileParam}` });

  const data = await getInvoiceForEInvoice(id);
  if (!data) return json(404, { error: 'Invoice not found' });

  let xml: string;
  try {
    xml = generateEInvoiceXml(profileParam, data);
  } catch (e) {
    return json(422, { error: (e as Error).message });
  }

  const meta = PROFILES[profileParam];
  const filename = `${meta.prefix}-${data.invoice.number || id}.xml`;
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': meta.contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
```

- [ ] **Step 4: `getInvoiceForEInvoice` in `native-billing.ts` ergänzen**

Modify: `website/src/lib/native-billing.ts` — am Ende der Datei (vor dem letzten `}` falls in einem Modul-Body):

```ts
import type { EInvoiceInput } from './einvoice-profile';

export async function getInvoiceForEInvoice(id: string): Promise<EInvoiceInput | null> {
  await initBillingTables();
  const r = await pool.query(
    `SELECT i.*, c.name AS c_name, c.email AS c_email, c.address_line1 AS c_addr,
            c.postal_code AS c_zip, c.city AS c_city, c.leitweg_id AS c_leitweg
       FROM invoices i JOIN billing_customers c ON c.id = i.customer_id
      WHERE i.id = $1`, [id]);
  const row = r.rows[0];
  if (!row) return null;
  const lines = (await pool.query(`SELECT * FROM invoice_lines WHERE invoice_id=$1 ORDER BY position`, [id])).rows;
  return {
    invoice: {
      number: row.number, issueDate: row.issue_date.toISOString().slice(0,10),
      dueDate: row.due_date.toISOString().slice(0,10),
      grossAmount: Number(row.gross_amount), netAmount: Number(row.net_amount),
      taxAmount: Number(row.tax_amount), taxMode: row.tax_mode,
      taxRate: Number(row.tax_rate), paymentReference: row.payment_reference ?? undefined,
    },
    lines: lines.map(l => ({
      description: l.description, quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price), unit: l.unit ?? 'C62',
    })),
    customer: {
      name: row.c_name, email: row.c_email, addressLine1: row.c_addr ?? undefined,
      postalCode: row.c_zip ?? undefined, city: row.c_city ?? undefined, country: 'DE',
      leitwegId: row.c_leitweg ?? undefined,
    },
    seller: {
      name:       process.env.SELLER_NAME        || process.env.BRAND_NAME || 'Unbekannt',
      address:    process.env.SELLER_ADDRESS     || '',
      postalCode: process.env.SELLER_POSTAL_CODE || '',
      city:       process.env.SELLER_CITY        || '',
      country:    process.env.SELLER_COUNTRY     || 'DE',
      vatId:      process.env.SELLER_VAT_ID      || '',
      iban:       process.env.SELLER_IBAN        || undefined,
      bic:        process.env.SELLER_BIC         || undefined,
    },
  };
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `cd website && pnpm vitest run "src/pages/api/billing/invoice/\[id\]/zugferd.test.ts"`
Erwartet: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add 'website/src/pages/api/billing/invoice/[id]/zugferd.ts' \
        'website/src/pages/api/billing/invoice/[id]/zugferd.test.ts' \
        website/src/lib/native-billing.ts
git commit -m "feat(billing): API ?profile= for Factur-X / XRechnung CII / XRechnung UBL download"
```

---

## Task 8: PDF/A-3-Embedding-Modul (`pdf-a3-embed.ts`)

**Files:**
- Create: `website/src/lib/pdf-a3-embed.ts`
- Create: `website/src/lib/pdf-a3-embed.test.ts`
- Modify: `website/package.json` (add `pdf-lib`)

- [ ] **Step 1: pdf-lib installieren**

Run: `cd website && pnpm add pdf-lib@^1.17.1`
Erwartet: `package.json` listet `pdf-lib` als dependency.

- [ ] **Step 2: sRGB-ICC-Profil bereitstellen**

Run:
```bash
mkdir -p website/src/assets
curl -fsSL https://www.color.org/profiles/sRGB_v4_ICC_preference.icc \
  -o website/src/assets/sRGB.icc
ls -la website/src/assets/sRGB.icc
```
Erwartet: ~60 kB Datei vorhanden. Falls download blockiert: alternativ aus `/usr/share/color/icc/colord/sRGB.icc` (Linux) kopieren.

- [ ] **Step 3: Failing test schreiben**

Create: `website/src/lib/pdf-a3-embed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { embedFacturXIntoPdfA3 } from './pdf-a3-embed';
import { validateWithMustang, mustangAvailable } from './mustang.test-helper';

async function tinyPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).drawText('Rechnung Test');
  return Buffer.from(await doc.save());
}

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"/>`;

describe('embedFacturXIntoPdfA3', () => {
  it('liefert PDF zurück mit /AF und /AFRelationship /Alternative', async () => {
    const out = await embedFacturXIntoPdfA3(await tinyPdf(), sampleXml, {
      conformanceLevel: 'MINIMUM', invoiceNumber: 'RE-1',
    });
    const text = out.toString('latin1');
    expect(text).toContain('/AFRelationship /Alternative');
    expect(text).toContain('factur-x.xml');
    expect(text).toContain('/Subtype /text#2Fxml');
  });
  it('XMP enthält Factur-X-Extension-Schema und PDF/A-3b-Marker', async () => {
    const out = await embedFacturXIntoPdfA3(await tinyPdf(), sampleXml, {
      conformanceLevel: 'MINIMUM', invoiceNumber: 'RE-1',
    });
    const text = out.toString('latin1');
    expect(text).toContain('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#');
    expect(text).toContain('<fx:DocumentType>INVOICE</fx:DocumentType>');
    expect(text).toContain('<fx:ConformanceLevel>MINIMUM</fx:ConformanceLevel>');
    expect(text).toContain('pdfaid:conformance="B"');
    expect(text).toContain('pdfaid:part="3"');
  });
  it.skipIf(!mustangAvailable)('PDF wird von Mustang als ZUGFeRD erkannt', async () => {
    const out = await embedFacturXIntoPdfA3(await tinyPdf(), sampleXml, {
      conformanceLevel: 'MINIMUM', invoiceNumber: 'RE-1',
    });
    const r = validateWithMustang(out, 'pdf');
    expect(r.output).toMatch(/factur-x|ZUGFeRD|XRechnung/i);
  });
});
```

- [ ] **Step 4: Test laufen lassen — soll fehlschlagen**

Run: `cd website && pnpm vitest run src/lib/pdf-a3-embed.test.ts`
Erwartet: FAIL — Modul existiert nicht.

- [ ] **Step 5: `pdf-a3-embed.ts` implementieren**

Create: `website/src/lib/pdf-a3-embed.ts`:

```ts
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFHexString, PDFRawStream, PDFString, PDFNumber } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

export type FacturXLevel = 'MINIMUM' | 'BASIC WL' | 'BASIC' | 'EN 16931' | 'EXTENDED' | 'XRECHNUNG';

export interface EmbedOptions {
  conformanceLevel: FacturXLevel;
  invoiceNumber: string;
  modificationDate?: Date;
  attachmentName?: string; // default: factur-x.xml; XRECHNUNG profile uses xrechnung.xml
}

const ICC_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sRGB.icc');

function pdfDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const abs = Math.abs(tz);
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` +
         `${sign}${p(Math.floor(abs / 60))}'${p(abs % 60)}'`;
}

function buildXmp(opts: EmbedOptions, modDate: Date): string {
  const iso = modDate.toISOString();
  const fileName = opts.attachmentName ?? 'factur-x.xml';
  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
                                  xmlns:dc="http://purl.org/dc/elements/1.1/"
                                  xmlns:xmp="http://ns.adobe.com/xap/1.0/"
                                  xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
                                  xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"
                                  xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
                                  xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
                                  xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#"
                                  pdfaid:part="3" pdfaid:conformance="B">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Rechnung ${escapeXml(opts.invoiceNumber)}</rdf:li></rdf:Alt></dc:title>
      <xmp:CreatorTool>mentolder-billing</xmp:CreatorTool>
      <xmp:CreateDate>${iso}</xmp:CreateDate>
      <xmp:ModifyDate>${iso}</xmp:ModifyDate>
      <pdf:Producer>pdf-lib + mentolder-billing</pdf:Producer>
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>${escapeXml(fileName)}</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>${opts.conformanceLevel}</fx:ConformanceLevel>
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentType</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>INVOICE</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>Version</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function embedFacturXIntoPdfA3(
  pdfBytes: Buffer | Uint8Array, factorXXml: string, opts: EmbedOptions,
): Promise<Buffer> {
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const fileName = opts.attachmentName ?? 'factur-x.xml';
  const modDate = opts.modificationDate ?? new Date();
  const xmlBuf = Buffer.from(factorXXml, 'utf8');
  const checksum = createHash('md5').update(xmlBuf).digest('hex');

  // Embedded file stream
  const embeddedStream = pdf.context.stream(xmlBuf, {
    Type: 'EmbeddedFile',
    Subtype: PDFName.of('text#2Fxml'),
    Params: pdf.context.obj({
      ModDate: PDFString.of(pdfDate(modDate)),
      CheckSum: PDFHexString.of(checksum),
      Size: PDFNumber.of(xmlBuf.length),
    }),
  });
  const embeddedRef = pdf.context.register(embeddedStream);

  // Filespec
  const filespec = pdf.context.obj({
    Type: 'Filespec',
    F: PDFString.of(fileName),
    UF: PDFHexString.fromText(fileName),
    Desc: PDFString.of('Factur-X / ZUGFeRD invoice'),
    AFRelationship: PDFName.of('Alternative'),
    EF: pdf.context.obj({ F: embeddedRef, UF: embeddedRef }),
  });
  const filespecRef = pdf.context.register(filespec);

  const catalog = pdf.catalog;

  // /AF on catalog (PDF 2.0 + Factur-X)
  catalog.set(PDFName.of('AF'), pdf.context.obj([filespecRef]));

  // /Names /EmbeddedFiles
  let names = catalog.lookup(PDFName.of('Names')) as PDFDict | undefined;
  if (!names) { names = pdf.context.obj({}); catalog.set(PDFName.of('Names'), names); }
  let embedded = (names as PDFDict).lookup(PDFName.of('EmbeddedFiles')) as PDFDict | undefined;
  if (!embedded) { embedded = pdf.context.obj({}); (names as PDFDict).set(PDFName.of('EmbeddedFiles'), embedded); }
  (embedded as PDFDict).set(PDFName.of('Names'),
    pdf.context.obj([PDFString.of(fileName), filespecRef]));

  // OutputIntent: sRGB
  const iccBytes = readFileSync(ICC_PATH);
  const iccStream = pdf.context.stream(iccBytes, { N: 3, Length: iccBytes.length });
  const iccRef = pdf.context.register(iccStream);
  const outputIntent = pdf.context.obj({
    Type: 'OutputIntent',
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccRef,
  });
  catalog.set(PDFName.of('OutputIntents'), pdf.context.obj([outputIntent]));

  // XMP metadata
  const xmpStream = pdf.context.stream(buildXmp(opts, modDate), {
    Type: 'Metadata', Subtype: 'XML',
  });
  catalog.set(PDFName.of('Metadata'), pdf.context.register(xmpStream));

  // Document Info dict
  pdf.setTitle(`Rechnung ${opts.invoiceNumber}`);
  pdf.setProducer('pdf-lib + mentolder-billing');
  pdf.setCreationDate(modDate);
  pdf.setModificationDate(modDate);

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
```

- [ ] **Step 6: Tests laufen lassen**

Run: `cd website && pnpm vitest run src/lib/pdf-a3-embed.test.ts`
Erwartet: 2 PASS strukturell, Mustang-Test PASS oder skipped.

- [ ] **Step 7: Commit**

```bash
git add website/package.json website/pnpm-lock.yaml website/src/lib/pdf-a3-embed.ts \
        website/src/lib/pdf-a3-embed.test.ts website/src/assets/sRGB.icc
git commit -m "feat(billing): PDF/A-3 post-processor embeds factur-x.xml with proper XMP + OutputIntent"
```

---

## Task 9: invoice-pdf.ts ruft Embedding auf

**Files:**
- Modify: `website/src/lib/invoice-pdf.ts`

- [ ] **Step 1: Failing test ergänzen**

Modify: `website/src/lib/invoice-pdf.test.ts` — füge hinzu:

```ts
import { generateInvoicePdf } from './invoice-pdf';

it('PDF enthält factur-x.xml als Anhang', async () => {
  const pdf = await generateInvoicePdf({
    invoice: { number: 'RE-9', issueDate: '2026-04-28', dueDate: '2026-05-12',
               grossAmount: 119, netAmount: 100, taxAmount: 19,
               taxMode: 'regelbesteuerung', taxRate: 19, paymentReference: 'RG9' },
    lines: [{ description: 'X', quantity: 1, unitPrice: 100 }],
    customer: { name: 'C', email: 'c@d.de' },
    seller: { name: 'mentolder', address: 'A', postalCode: '1', city: 'K',
              country: 'DE', vatId: 'DE1' },
    profile: 'factur-x-minimum',
  });
  expect(pdf.toString('latin1')).toContain('factur-x.xml');
  expect(pdf.toString('latin1')).toContain('/AFRelationship /Alternative');
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `cd website && pnpm vitest run src/lib/invoice-pdf.test.ts -t "factur-x.xml als Anhang"`
Erwartet: FAIL — `generateInvoicePdf` akzeptiert kein `profile`-Feld und embedded nichts.

- [ ] **Step 3: `generateInvoicePdf` erweitern**

Modify: `website/src/lib/invoice-pdf.ts` — passe Signatur und Body an. Lokalisiere die Zeile `export async function generateInvoicePdf(p: {` und ersetze die Funktion:

```ts
import PDFDocument from 'pdfkit';
import { embedFacturXIntoPdfA3, type FacturXLevel } from './pdf-a3-embed';
import { generateEInvoiceXml, type EInvoiceProfile, type EInvoiceInput } from './einvoice-profile';

const PROFILE_LEVEL: Record<EInvoiceProfile, FacturXLevel> = {
  'factur-x-minimum': 'MINIMUM',
  'xrechnung-cii':    'XRECHNUNG',
  'xrechnung-ubl':    'XRECHNUNG',
};

export async function generateInvoicePdf(
  p: EInvoiceInput & { profile?: EInvoiceProfile }
): Promise<Buffer> {
  const profile = p.profile ?? 'factur-x-minimum';

  // 1. PDFKit erzeugt Basis-PDF (existing layout code stays as-is below this block)
  const doc = new PDFDocument({ size: 'A4', margin: 0,
    info: { Title: p.invoice.number, Author: p.seller.name } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>(r => doc.on('end', () => r(Buffer.concat(chunks))));

  // … (bestehender Layout-Code: Header, Adressblock, Tabelle, Summen, Footer.
  //    Diese Zeilen bleiben unverändert. Falls die Funktion bisher nur einen
  //    Buffer zurückgegeben hat, dort den Original-Code einsetzen.)

  doc.end();
  const basePdf = await done;

  // 2. ZUGFeRD-XML erzeugen
  const xml = generateEInvoiceXml(profile, p);
  const attachmentName = profile === 'xrechnung-ubl' || profile === 'xrechnung-cii'
    ? 'xrechnung.xml' : 'factur-x.xml';

  // 3. PDF/A-3 + Embedding
  return embedFacturXIntoPdfA3(basePdf, xml, {
    conformanceLevel: PROFILE_LEVEL[profile],
    invoiceNumber: p.invoice.number,
    attachmentName,
    modificationDate: new Date(p.invoice.issueDate),
  });
}
```

**Wichtig:** Der bestehende PDFKit-Layout-Code (Adressblock, Tabelle, Summenzeile, Fußnote) bleibt zwischen `// … (bestehender Layout-Code …)` erhalten. Lokalisiere ihn vor dem Edit per `grep -n "doc\.text\|doc\.font\|doc\.image" website/src/lib/invoice-pdf.ts | head -20` und behalte alle Zeilen.

- [ ] **Step 4: Tests laufen lassen**

Run: `cd website && pnpm vitest run src/lib/invoice-pdf.test.ts`
Erwartet: alle Tests PASS, neuer Anhang-Test PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/invoice-pdf.ts website/src/lib/invoice-pdf.test.ts
git commit -m "feat(billing): generateInvoicePdf embeds factur-x.xml via PDF/A-3 post-processor"
```

---

## Task 10: API-Route für PDF mit Embedding (`/api/billing/invoice/[id]/pdf?profile=…`)

**Files:**
- Create or Modify: `website/src/pages/api/billing/invoice/[id]/pdf.ts`

- [ ] **Step 1: Status der Datei prüfen**

Run: `ls 'website/src/pages/api/billing/invoice/[id]/' && grep -l "generateInvoicePdf" website/src/pages/api/ -r 2>/dev/null`
Notiere: existiert eine `pdf.ts`? Falls ja, modify; falls nein, create.

- [ ] **Step 2: Test schreiben**

Create: `website/src/pages/api/billing/invoice/[id]/pdf.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { GET } from './pdf';

vi.mock('../../../../../lib/auth', () => ({ getSession: () => ({ user: { is_admin: true }}), isAdmin: () => true }));
vi.mock('../../../../../lib/native-billing', () => ({
  getInvoiceForEInvoice: async () => ({
    invoice: { number: 'RE-9', issueDate: '2026-04-28', dueDate: '2026-05-12',
               grossAmount: 119, netAmount: 100, taxAmount: 19,
               taxMode: 'regelbesteuerung', taxRate: 19, paymentReference: 'RG9' },
    lines: [{ description: 'X', quantity: 1, unitPrice: 100 }],
    customer: { name: 'C', email: 'c@d.de', leitwegId: '991-01234-44',
                addressLine1: 'A', postalCode: '1', city: 'B', country: 'DE' },
    seller: { name: 'mentolder', address: 'A', postalCode: '1', city: 'K',
              country: 'DE', vatId: 'DE1', iban: 'DE02120300000000202051' },
  }),
}));

const req = (url: string) => ({ request: new Request(url), params: { id: 'inv-1' } } as never);

it('default = factur-x-minimum, Content-Type pdf', async () => {
  const r = await GET(req('https://x/?'));
  expect(r.headers.get('Content-Type')).toBe('application/pdf');
  const buf = Buffer.from(await r.arrayBuffer());
  expect(buf.toString('latin1')).toContain('factur-x.xml');
}, 20_000);

it('?profile=xrechnung-cii embeddet xrechnung.xml', async () => {
  const r = await GET(req('https://x/?profile=xrechnung-cii'));
  const buf = Buffer.from(await r.arrayBuffer());
  expect(buf.toString('latin1')).toContain('xrechnung.xml');
}, 20_000);
```

- [ ] **Step 3: Test laufen lassen**

Run: `cd website && pnpm vitest run "src/pages/api/billing/invoice/\[id\]/pdf.test.ts"`
Erwartet: FAIL — Modul fehlt oder kein Profile-Param.

- [ ] **Step 4: Route schreiben**

Create or Modify: `website/src/pages/api/billing/invoice/[id]/pdf.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getInvoiceForEInvoice } from '../../../../../lib/native-billing';
import { generateInvoicePdf } from '../../../../../lib/invoice-pdf';
import type { EInvoiceProfile } from '../../../../../lib/einvoice-profile';

const VALID: ReadonlySet<EInvoiceProfile> = new Set(['factur-x-minimum', 'xrechnung-cii', 'xrechnung-ubl']);

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const id = params.id;
  if (!id) return new Response('Missing invoice ID', { status: 400 });

  const url = new URL(request.url);
  const profile = (url.searchParams.get('profile') ?? 'factur-x-minimum') as EInvoiceProfile;
  if (!VALID.has(profile)) return new Response(`Unknown profile: ${profile}`, { status: 400 });

  const data = await getInvoiceForEInvoice(id);
  if (!data) return new Response('Invoice not found', { status: 404 });

  let pdf: Buffer;
  try {
    pdf = await generateInvoicePdf({ ...data, profile });
  } catch (e) {
    return new Response((e as Error).message, { status: 422 });
  }

  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${data.invoice.number}.pdf"`,
    },
  });
};
```

- [ ] **Step 5: Tests laufen lassen**

Run: `cd website && pnpm vitest run "src/pages/api/billing/invoice/\[id\]/pdf.test.ts"`
Erwartet: 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add 'website/src/pages/api/billing/invoice/[id]/pdf.ts' \
        'website/src/pages/api/billing/invoice/[id]/pdf.test.ts'
git commit -m "feat(billing): /api/billing/invoice/:id/pdf?profile=… serves ZUGFeRD/XRechnung PDF/A-3"
```

---

## Task 11: Admin-UI — Leitweg-ID-Feld auf CustomerForm

**Files:**
- Modify: `website/src/components/admin/CustomerForm.svelte`
- Modify: `website/src/lib/native-billing.ts` (createCustomer akzeptiert leitwegId)

- [ ] **Step 1: Form-Test (Vitest + @testing-library/svelte)**

Modify: existierende `CustomerForm.test.ts` (oder neu) — Test:

```ts
import { render, fireEvent } from '@testing-library/svelte';
import CustomerForm from './CustomerForm.svelte';

it('zeigt Inline-Fehler bei ungültiger Leitweg-ID', async () => {
  const { getByLabelText, findByText } = render(CustomerForm, { customer: null });
  await fireEvent.input(getByLabelText(/Leitweg-ID/i), { target: { value: 'not-valid' }});
  expect(await findByText(/Format ungültig/)).toBeTruthy();
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `cd website && pnpm vitest run src/components/admin/CustomerForm.test.ts`
Erwartet: FAIL — Feld fehlt.

- [ ] **Step 3: Feld in Svelte-Form ergänzen**

Modify: `website/src/components/admin/CustomerForm.svelte` — innerhalb des Formular-Bodys, neben `vat_number`:

```svelte
<script lang="ts">
  import { validateLeitwegId } from '../../lib/leitweg';
  // … bestehende Imports/Props bleiben
  let leitwegId: string = customer?.leitwegId ?? '';
  $: leitwegError = leitwegId ? (validateLeitwegId(leitwegId).reason ?? '') : '';
</script>

<label>
  Leitweg-ID (B2G, optional)
  <input
    type="text"
    bind:value={leitwegId}
    name="leitweg_id"
    aria-invalid={!!leitwegError}
    placeholder="z. B. 991-01234-44"
  />
  {#if leitwegError}
    <span class="error">Format ungültig: {leitwegError}</span>
  {/if}
</label>
```

Auf Submit `leitwegId` mit anderen Feldern an `/api/admin/customers` schicken.

- [ ] **Step 4: `createCustomer`/`updateCustomer` in `native-billing.ts` erweitern**

Modify: `website/src/lib/native-billing.ts:14-30` — INSERT erweitern:

```ts
const r = await pool.query(
  `INSERT INTO billing_customers (brand, name, email, company, address_line1, city, postal_code, vat_number, leitweg_id)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
   ON CONFLICT (brand, email) DO UPDATE
     SET name=EXCLUDED.name, company=EXCLUDED.company,
         address_line1=EXCLUDED.address_line1, city=EXCLUDED.city,
         postal_code=EXCLUDED.postal_code, vat_number=EXCLUDED.vat_number,
         leitweg_id=EXCLUDED.leitweg_id
   RETURNING *`,
  [p.brand, p.name, p.email, p.company??null, p.addressLine1??null,
   p.city??null, p.postalCode??null, p.vatNumber??null, p.leitwegId??null]
);
```

Und `Customer`-Interface + `mapCustomer` um `leitwegId` ergänzen:

```ts
export interface Customer {
  // … existing fields
  leitwegId?: string;
}
// in mapCustomer:
leitwegId: (row.leitweg_id as string) ?? undefined,
```

Sowie das `createCustomer`-Param-Type:

```ts
export async function createCustomer(p: {
  brand: string; name: string; email: string; company?: string;
  addressLine1?: string; city?: string; postalCode?: string;
  vatNumber?: string; leitwegId?: string;
}): Promise<Customer> { … }
```

- [ ] **Step 5: Tests laufen lassen**

Run: `cd website && pnpm vitest run`
Erwartet: alle PASS, kein Regression.

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/CustomerForm.svelte \
        website/src/components/admin/CustomerForm.test.ts \
        website/src/lib/native-billing.ts
git commit -m "feat(billing): admin can set Leitweg-ID per customer with live KoSIT validation"
```

---

## Task 12: Taskfile-Target + Doku

**Files:**
- Modify: `Taskfile.yml`
- Modify: `k3d/docs-content/adminhandbuch.md`

- [ ] **Step 1: Task `billing:validate-einvoice` ergänzen**

Modify: `Taskfile.yml` — neuer Task neben den anderen `billing:*`-Tasks (oder im `tasks:`-Block):

```yaml
  billing:validate-einvoice:
    desc: "Validate an XML or PDF e-invoice via Mustangproject (in Docker)"
    cmds:
      - bash website/tests/fixtures/mustang.sh validate "{{.CLI_ARGS}}"
    silent: false
```

Verify:

```bash
task billing:validate-einvoice -- /tmp/some.pdf
```

- [ ] **Step 2: Adminhandbuch-Sektion ergänzen**

Modify: `k3d/docs-content/adminhandbuch.md` — am Ende einer existierenden Billing-Sektion:

```markdown
### E-Rechnung (XRechnung / ZUGFeRD)

Drei Profile stehen zur Auswahl beim Versand:

| Profil | Verwendung | URL |
|---|---|---|
| `factur-x-minimum` | B2C / interne Archivierung | `/api/billing/invoice/<id>/pdf` |
| `xrechnung-cii` | B2G (Bund/Länder), CII-Syntax | `/api/billing/invoice/<id>/pdf?profile=xrechnung-cii` |
| `xrechnung-ubl` | B2G, UBL-2.1-Syntax (z. B. ZRE/OZG-RE) | `/api/billing/invoice/<id>/pdf?profile=xrechnung-ubl` |

Für `xrechnung-*` muss die **Leitweg-ID** des Empfängers im Kundenstamm gesetzt sein
(Format `<grob>-<fein?>-<prüfziffer>`). Sonst antwortet die API mit HTTP 422.

Validierung lokaler Dateien:
```
task billing:validate-einvoice -- ./rechnung.pdf
```
Erwartet: `Mustang … is a valid E-Invoice (Factur-X / XRechnung).`
```

- [ ] **Step 3: Docs-ConfigMap deployen**

Run:
```bash
task docs:deploy ENV=mentolder
task docs:restart ENV=mentolder
task docs:deploy ENV=korczewski
task docs:restart ENV=korczewski
```
Erwartet: ConfigMap aktualisiert, Pod restartet.

- [ ] **Step 4: Final-Sweep — alle Tests + Lint**

Run:
```bash
cd website && pnpm vitest run && pnpm lint
cd .. && task workspace:validate
```
Erwartet: alle Tests PASS, Lint clean, kustomize build OK.

- [ ] **Step 5: Commit + PR**

```bash
git add Taskfile.yml k3d/docs-content/adminhandbuch.md
git commit -m "docs(billing): document e-invoice profiles, Leitweg-ID, validation task"
git push -u origin "$(git branch --show-current)"
gh pr create --title "feat(billing): ZUGFeRD/XRechnung output (Plan C)" --body "$(cat <<'EOF'
## Summary
- XRechnung 3.0 CIUS Generatoren (CII D16B + UBL 2.1) mit BT-/BG-Mapping
- Leitweg-ID-Feld auf billing_customers + KoSIT-Validierung + Admin-UI
- PDF/A-3-Embedding via pdf-lib (factur-x.xml + XMP + sRGB OutputIntent)
- Validation via Mustangproject (Docker), neuer Task `billing:validate-einvoice`

## Test plan
- [x] vitest grün (alle 3 Profile + Embedding + API)
- [x] Mustang-Validation grün (XML + PDF) wo Docker verfügbar
- [x] kustomize build OK
- [ ] Manuell: PDF-Download für Kunde mit Leitweg-ID öffnet in Acrobat als PDF/A-3
EOF
)"
```

---

## Traceability — Anforderungen ↔ Tasks

| Anforderung | Tasks |
|---|---|
| #3 XRechnung UBL 2.1 Generator | Task 5 |
| #3 XRechnung CII D16B Generator | Task 4 |
| #3 BT-/BG-Field-Mapping | Task 4 (CII), Task 5 (UBL) |
| #3 Leitweg-ID Handling B2G | Tasks 1, 2, 3, 11 |
| #6 PDF → PDF/A-3 Konvertierung | Task 8 |
| #6 factur-x.xml als Embedded File | Tasks 8, 9 |
| #6 XMP-Metadata mit Factur-X-Extension-Schema | Task 8 |
| #6 Validation via Mustangproject | Tasks 6, 12 |
| Profile-Auswahl im API | Tasks 7, 10 |
| Admin-Workflow für B2G | Tasks 11, 12 |

## Offene Punkte (spätere Iterationen)

- [ ] Profil `xrechnung-cii` auf EN-16931-EXTENDED upgraden, sobald Bedarf
- [ ] PEPPOL-Anbindung (BT-34 Endpoint-ID) für direkten elektronischen Versand
- [ ] Digitale Signatur (PAdES) auf PDF/A-3-Output für GoBD-Unveränderbarkeit
- [ ] Mehrwertsteuer-Sonderfälle: Reverse-Charge (BT-95 K), innergemeinschaftliche Lieferung (BT-95 K + IT) — derzeit nur S/E gemappt
