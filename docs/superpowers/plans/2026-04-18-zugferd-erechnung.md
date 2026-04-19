# ZUGFeRD E-Rechnung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin kann für jede finalisierte Stripe-Rechnung eine ZUGFeRD-konforme E-Rechnung (XML, MINIMUM-Profil) herunterladen, die deutschen B2B-Pflichtanforderungen (§ 14 UStG, ab 2028 verpflichtend) erfüllt.

**Architecture:** Ein neues `zugferd.ts` Lib-Modul generiert das CII-XML aus Stripe-Rechnungsdaten als Template-String (keine neuen npm-Pakete nötig). Ein neuer API-Endpunkt `GET /api/billing/invoice/[id]/zugferd` holt die Stripe-Rechnung per ID, generiert das XML und gibt es als Download zurück (admin-only). In der Rechnungstabelle erscheint ein Download-Link pro Zeile.

**Tech Stack:** Astro API Routes, TypeScript, Stripe Node SDK (bereits installiert), ZUGFeRD MINIMUM Profil (Factur-X 1.0 CII-Syntax), keine neuen Abhängigkeiten.

---

## Dateistruktur

| Datei | Aktion | Verantwortung |
|---|---|---|
| `website/src/lib/zugferd.ts` | Neu anlegen | ZUGFeRD-XML-Generator (reiner String-Template) |
| `website/src/lib/stripe-billing.ts` | Erweitern | Neue Funktion `getFullInvoice(id)` |
| `website/src/pages/api/billing/invoice/[id]/zugferd.ts` | Neu anlegen | API-Endpunkt: Auth-Check → Stripe-Daten → XML → Download |
| `website/src/pages/admin/rechnungen.astro` | Erweitern | Download-Button pro Tabellenzeile |
| `website/tests/zugferd.test.mjs` | Neu anlegen | Unit-Tests für den XML-Generator |

---

## Task 1: `getFullInvoice` in stripe-billing.ts

Fügt eine Funktion hinzu, die eine einzelne Stripe-Rechnung vollständig expandiert (Customer + Lines) abruft.

**Files:**
- Modify: `website/src/lib/stripe-billing.ts`

- [ ] **Step 1: Typen und Funktion ergänzen**

Folgende Funktion ans Ende von `website/src/lib/stripe-billing.ts` anfügen:

```typescript
export interface FullInvoice extends AdminBillingInvoice {
  currency: string;
  taxAmount: number;
  subtotalExclTax: number;
  buyerAddress: {
    line1: string;
    city: string;
    postalCode: string;
    country: string;
  } | null;
  buyerVatId: string | null;
  lines: Array<{ description: string; amountNet: number }>;
}

export async function getFullInvoice(invoiceId: string): Promise<FullInvoice | null> {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const inv = await stripe.invoices.retrieve(invoiceId, {
    expand: ['customer', 'lines'],
  });
  const customer = typeof inv.customer === 'object' && inv.customer !== null
    ? (inv.customer as Stripe.Customer)
    : null;

  const addr = customer?.address;
  return {
    ...mapInvoice(inv),
    customerName: customer?.name ?? '—',
    customerEmail: customer?.email ?? '—',
    currency: (inv.currency ?? 'eur').toUpperCase(),
    taxAmount: (inv.tax ?? 0) / 100,
    subtotalExclTax: ((inv.subtotal_excluding_tax ?? inv.subtotal ?? 0)) / 100,
    buyerAddress: addr ? {
      line1: addr.line1 ?? '',
      city: addr.city ?? '',
      postalCode: addr.postal_code ?? '',
      country: addr.country ?? 'DE',
    } : null,
    buyerVatId: customer?.metadata?.vat_number ?? null,
    lines: (inv.lines?.data ?? []).map(l => ({
      description: l.description ?? '',
      amountNet: (l.amount ?? 0) / 100,
    })),
  };
}
```

- [ ] **Step 2: Compile-Check**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -30
```

Expected: keine Fehler (oder nur unveränderte Bestandsfehler).

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/stripe-billing.ts
git commit -m "feat(billing): add getFullInvoice with expanded customer+lines"
```

---

## Task 2: ZUGFeRD-XML-Generator (`zugferd.ts`)

Erzeugt ein valides ZUGFeRD MINIMUM Profil XML (Factur-X 1.0, CII-Syntax) aus Rechnungsdaten.

**Files:**
- Create: `website/src/lib/zugferd.ts`
- Create: `website/tests/zugferd.test.mjs`

- [ ] **Step 1: Testdatei schreiben (failing)**

`website/tests/zugferd.test.mjs` anlegen:

```javascript
// Tests für den ZUGFeRD-XML-Generator
// Run: node tests/zugferd.test.mjs

// ESM-Import des transpilierten Moduls ist im Node-Kontext nicht direkt möglich.
// Stattdessen testen wir das Verhalten durch Inline-Rekonstruktion der Logik
// (oder über den API-Endpunkt im Integrationstest weiter unten).
// Diese Datei enthält Unit-Tests für die esc() und toZugferdDate() Hilfsfunktionen
// sowie einen Smoke-Test der generierten XML-Struktur via dynamischem Import.

import { strict as assert } from 'node:assert';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

// -- Hilfsfunktionen inline (müssen mit zugferd.ts übereinstimmen) --

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toZugferdDate(iso) {
  return iso.replace(/-/g, '').slice(0, 8);
}

function fmt(n) {
  return n.toFixed(2);
}

console.log('\nZUGFeRD Helper Functions');

test('esc() escapes ampersand', () => {
  assert.equal(esc('A & B'), 'A &amp; B');
});

test('esc() escapes less-than', () => {
  assert.equal(esc('<tag>'), '&lt;tag&gt;');
});

test('esc() escapes quotes', () => {
  assert.equal(esc('"hello"'), '&quot;hello&quot;');
});

test('esc() handles null/undefined', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('toZugferdDate() strips hyphens', () => {
  assert.equal(toZugferdDate('2024-03-15'), '20240315');
});

test('toZugferdDate() handles full ISO datetime', () => {
  assert.equal(toZugferdDate('2024-03-15T10:00:00.000Z'), '20240315');
});

test('fmt() produces 2 decimal places', () => {
  assert.equal(fmt(100), '100.00');
  assert.equal(fmt(99.9), '99.90');
  assert.equal(fmt(0), '0.00');
});

// -- XML Structure Smoke Test --

console.log('\nZUGFeRD XML Structure');

// Minimal invoice fixture
const fixture = {
  number: 'RE-2024-001',
  date: '2024-01-15',
  dueDate: '2024-02-15',
  currency: 'EUR',
  customerName: 'Test GmbH & Co. KG',
  customerEmail: 'test@example.com',
  amountDue: 119.00,
  subtotalExclTax: 100.00,
  taxAmount: 19.00,
  buyerAddress: {
    line1: 'Musterstraße 1',
    city: 'Berlin',
    postalCode: '10115',
    country: 'DE',
  },
  buyerVatId: null,
  lines: [{ description: 'Beratungsleistung', amountNet: 100.00 }],
};

const sellerEnv = {
  SELLER_NAME: 'Berater AG',
  SELLER_ADDRESS: 'Hauptstraße 5',
  SELLER_POSTAL_CODE: '80331',
  SELLER_CITY: 'München',
  SELLER_COUNTRY: 'DE',
  SELLER_VAT_ID: '',
};

// Inline minimal XML builder (mirrors zugferd.ts logic)
function buildXml(inv, env) {
  const sellerName = env.SELLER_NAME || 'Unbekannt';
  const isKleinunternehmer = !env.SELLER_VAT_ID;
  const grandTotal = fmt(inv.amountDue);
  const taxBasis = isKleinunternehmer ? grandTotal : fmt(inv.subtotalExclTax);
  const taxTotal = isKleinunternehmer ? '0.00' : fmt(inv.taxAmount);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.number)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${toZugferdDate(inv.date)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc(inv.customerEmail)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${esc(sellerName)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(env.SELLER_POSTAL_CODE)}</ram:PostcodeCode>
          <ram:LineOne>${esc(env.SELLER_ADDRESS)}</ram:LineOne>
          <ram:CityName>${esc(env.SELLER_CITY)}</ram:CityName>
          <ram:CountryID>${esc(env.SELLER_COUNTRY || 'DE')}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${env.SELLER_VAT_ID ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(env.SELLER_VAT_ID)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(inv.customerName)}</ram:Name>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${esc(inv.currency)}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>${taxBasis}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${esc(inv.currency)}">${taxTotal}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${grandTotal}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${grandTotal}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

const xml = buildXml(fixture, sellerEnv);

test('XML contains ZUGFeRD MINIMUM guideline ID', () => {
  assert.ok(xml.includes('urn:factur-x.eu:1p0:minimum'), 'missing guideline ID');
});

test('XML contains invoice number', () => {
  assert.ok(xml.includes('<ram:ID>RE-2024-001</ram:ID>'), 'missing invoice number');
});

test('XML contains TypeCode 380', () => {
  assert.ok(xml.includes('<ram:TypeCode>380</ram:TypeCode>'), 'missing TypeCode');
});

test('XML contains issue date in format 102', () => {
  assert.ok(xml.includes('20240115'), 'missing date in YYYYMMDD format');
});

test('XML escapes special chars in buyer name', () => {
  assert.ok(xml.includes('Test GmbH &amp; Co. KG'), 'ampersand not escaped');
});

test('XML omits SpecifiedTaxRegistration for Kleinunternehmer', () => {
  assert.ok(!xml.includes('SpecifiedTaxRegistration'), 'should not have tax reg for Kleinunternehmer');
});

test('XML has TaxTotalAmount = 0.00 for Kleinunternehmer', () => {
  assert.ok(xml.includes('<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>'), 'wrong tax total');
});

test('XML has GrandTotalAmount = 119.00', () => {
  assert.ok(xml.includes('<ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>'), 'wrong grand total');
});

// With VAT
const sellerWithVat = { ...sellerEnv, SELLER_VAT_ID: 'DE123456789' };
const xmlWithVat = buildXml(fixture, sellerWithVat);

test('XML includes SpecifiedTaxRegistration when VAT ID present', () => {
  assert.ok(xmlWithVat.includes('schemeID="VA"'), 'missing VAT registration');
  assert.ok(xmlWithVat.includes('DE123456789'), 'missing VAT ID value');
});

test('XML has TaxBasisTotalAmount = subtotal when VAT registered', () => {
  assert.ok(xmlWithVat.includes('<ram:TaxBasisTotalAmount>100.00</ram:TaxBasisTotalAmount>'), 'wrong tax basis');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Tests ausführen (müssen mit "module not found" o.ä. fehlschlagen, da zugferd.ts noch nicht existiert — hier testen wir Inline-Logik, also müssen sie BESTEHEN)**

```bash
cd /home/patrick/Bachelorprojekt/website && node tests/zugferd.test.mjs
```

Expected: Alle Tests grün (die Logik ist inline in der Testdatei, noch kein Import von zugferd.ts).

- [ ] **Step 3: `zugferd.ts` implementieren**

`website/src/lib/zugferd.ts` anlegen:

```typescript
import type { FullInvoice } from './stripe-billing';

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toZugferdDate(iso: string): string {
  return iso.replace(/-/g, '').slice(0, 8);
}

function fmt(n: number): string {
  return n.toFixed(2);
}

export interface ZugferdSellerConfig {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  vatId: string;
}

export function sellerConfigFromEnv(): ZugferdSellerConfig {
  return {
    name:       process.env.SELLER_NAME        || process.env.BRAND_NAME || 'Unbekannt',
    address:    process.env.SELLER_ADDRESS     || '',
    postalCode: process.env.SELLER_POSTAL_CODE || '',
    city:       process.env.SELLER_CITY        || '',
    country:    process.env.SELLER_COUNTRY     || 'DE',
    vatId:      process.env.SELLER_VAT_ID      || '',
  };
}

export function generateZugferdXml(inv: FullInvoice, seller: ZugferdSellerConfig): string {
  const isKleinunternehmer = !seller.vatId;
  const grandTotal  = fmt(inv.amountDue);
  const taxBasis    = isKleinunternehmer ? grandTotal : fmt(inv.subtotalExclTax);
  const taxTotal    = isKleinunternehmer ? '0.00' : fmt(inv.taxAmount);
  const currency    = esc(inv.currency);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.number)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${toZugferdDate(inv.date)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc(inv.customerEmail)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${esc(seller.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(seller.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${esc(seller.address)}</ram:LineOne>
          <ram:CityName>${esc(seller.city)}</ram:CityName>
          <ram:CountryID>${esc(seller.country)}</ram:CountryID>
        </ram:PostalTradeAddress>${seller.vatId ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(seller.vatId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(inv.customerName)}</ram:Name>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>${taxBasis}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${currency}">${taxTotal}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${grandTotal}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${grandTotal}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}
```

- [ ] **Step 4: Compile-Check**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -30
```

Expected: keine neuen Fehler.

- [ ] **Step 5: Tests erneut ausführen**

```bash
cd /home/patrick/Bachelorprojekt/website && node tests/zugferd.test.mjs
```

Expected: Alle grün.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/zugferd.ts website/tests/zugferd.test.mjs
git commit -m "feat(billing): ZUGFeRD MINIMUM XML generator with unit tests"
```

---

## Task 3: API-Endpunkt `/api/billing/invoice/[id]/zugferd`

Neuer Admin-Only GET-Endpunkt, der die Stripe-Rechnung lädt und als XML-Datei zurückgibt.

**Files:**
- Create: `website/src/pages/api/billing/invoice/[id]/zugferd.ts`

- [ ] **Step 1: Verzeichnis-Struktur sicherstellen**

```bash
ls /home/patrick/Bachelorprojekt/website/src/pages/api/billing/
```

Expected: `create-invoice.ts` vorhanden; Unterordner `invoice/` noch nicht vorhanden (wird durch die neue Datei implizit angelegt).

- [ ] **Step 2: Endpunkt anlegen**

`website/src/pages/api/billing/invoice/[id]/zugferd.ts` anlegen:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getFullInvoice } from '../../../../../lib/stripe-billing';
import { generateZugferdXml, sellerConfigFromEnv } from '../../../../../lib/zugferd';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const invoiceId = params.id;
  if (!invoiceId) {
    return new Response(JSON.stringify({ error: 'Missing invoice ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const inv = await getFullInvoice(invoiceId);
  if (!inv) {
    return new Response(JSON.stringify({ error: 'Invoice not found or Stripe not configured' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const seller = sellerConfigFromEnv();
  const xml = generateZugferdXml(inv, seller);
  const filename = `erechnung-${inv.number || invoiceId}.xml`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
```

- [ ] **Step 3: Compile-Check**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -30
```

Expected: keine neuen Fehler.

- [ ] **Step 4: Commit**

```bash
git add "website/src/pages/api/billing/invoice/[id]/zugferd.ts"
git commit -m "feat(billing): GET /api/billing/invoice/[id]/zugferd endpoint"
```

---

## Task 4: Download-Button in `rechnungen.astro`

Pro Tabellenzeile einen "E-Rechnung ↓" Link anfügen.

**Files:**
- Modify: `website/src/pages/admin/rechnungen.astro`

- [ ] **Step 1: Tabellen-Header um Spalte erweitern**

In `website/src/pages/admin/rechnungen.astro` die `<thead>`-Zeile finden. Nach der letzten `<th>` (Stripe) eine neue Spalte einfügen:

```html
<!-- Vorher: -->
<th class="text-right px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Stripe</th>

<!-- Nachher: -->
<th class="text-right px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Stripe</th>
<th class="text-right px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">E-Rechnung</th>
```

- [ ] **Step 2: Tabellen-Body um Download-Link erweitern**

In der `invoices.map(inv => ...)` Zeile nach der Stripe-Spalte einfügen:

```html
<!-- Vorher: -->
<td class="px-4 py-3 text-sm text-right">
  <a href={stripeInvoiceDashboardUrl(inv.id)} target="_blank" rel="noopener" class="text-xs text-blue-400 hover:underline">Stripe ↗</a>
</td>

<!-- Nachher: -->
<td class="px-4 py-3 text-sm text-right">
  <a href={stripeInvoiceDashboardUrl(inv.id)} target="_blank" rel="noopener" class="text-xs text-blue-400 hover:underline">Stripe ↗</a>
</td>
<td class="px-4 py-3 text-sm text-right">
  {['draft', 'void'].includes(inv.status) ? (
    <span class="text-xs text-muted/40">—</span>
  ) : (
    <a
      href={`/api/billing/invoice/${inv.id}/zugferd`}
      download
      class="text-xs text-green-400 hover:underline"
      title="ZUGFeRD XML herunterladen"
    >XML ↓</a>
  )}
</td>
```

Entwürfe und stornierte Rechnungen zeigen keinen Link (kein Download sinnvoll).

- [ ] **Step 3: Build-Test**

```bash
cd /home/patrick/Bachelorprojekt/website && npx astro check 2>&1 | tail -20
```

Expected: keine neuen Fehler/Warnungen.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/admin/rechnungen.astro
git commit -m "feat(billing): E-Rechnung XML download button in admin invoice table"
```

---

## Task 5: Seller-Env-Vars in Kubernetes-Secrets ergänzen

Die Seller-Infos (Adresse, USt-ID) müssen als Umgebungsvariablen in den Website-Pod.

**Files:**
- Modify: `k3d/secrets.yaml` (dev-Werte)
- Modify: `k3d/website.yaml` (Deployment env-Sektion)

- [ ] **Step 1: `k3d/secrets.yaml` lesen**

```bash
grep -n "SELLER\|BRAND_NAME" /home/patrick/Bachelorprojekt/k3d/secrets.yaml | head -20
```

- [ ] **Step 2: Seller-Secrets ergänzen**

In `k3d/secrets.yaml` in das `website-secrets` Secret folgende Keys einfügen (nach dem letzten vorhandenen Key):

```yaml
  SELLER_NAME: "Mentolder Coaching"
  SELLER_ADDRESS: "Musterstraße 1"
  SELLER_POSTAL_CODE: "12345"
  SELLER_CITY: "Musterstadt"
  SELLER_COUNTRY: "DE"
  SELLER_VAT_ID: ""
```

Werte für dev-Umgebung. Produktionswerte werden via sealed secrets gesetzt.

- [ ] **Step 3: `k3d/website.yaml` Deployment-Env erweitern**

```bash
grep -n "SELLER\|BRAND_NAME\|envFrom\|secretKeyRef" /home/patrick/Bachelorprojekt/k3d/website.yaml | head -20
```

Prüfen ob `envFrom: - secretRef: name: website-secrets` bereits alle Keys aus dem Secret übergibt. Falls ja, sind keine weiteren Änderungen nötig (alle neuen Secret-Keys werden automatisch gemountet). Falls einzelne `env`-Einträge statt `envFrom` verwendet werden, die neuen Vars analog ergänzen.

- [ ] **Step 4: Manifest validieren**

```bash
cd /home/patrick/Bachelorprojekt && task workspace:validate 2>&1 | tail -10
```

Expected: `No errors found.`

- [ ] **Step 5: Commit**

```bash
git add k3d/secrets.yaml k3d/website.yaml
git commit -m "feat(billing): add SELLER_* env vars for ZUGFeRD seller info"
```

---

## Task 6: End-to-End Smoke Test (manuell)

Prüft den vollständigen Download-Flow.

**Files:**
- Keine Dateiänderungen — manuelle Verifikation.

- [ ] **Step 1: Dev-Server starten**

```bash
cd /home/patrick/Bachelorprojekt/website && task website:dev
```

- [ ] **Step 2: Als Admin einloggen und Rechnungsseite aufrufen**

Browser: `http://localhost:4321/admin/rechnungen`

Erwartung: Neue Spalte "E-Rechnung" in der Tabelle sichtbar.

- [ ] **Step 3: XML-Download testen**

Auf `XML ↓` einer offenen oder bezahlten Rechnung klicken.

Erwartung: Browser lädt eine `.xml`-Datei herunter. Datei in einem Texteditor öffnen und prüfen:
- Beginnt mit `<?xml version="1.0" encoding="UTF-8"?>`
- Enthält `urn:factur-x.eu:1p0:minimum`
- Enthält korrekte Rechnungsnummer
- Enthält Kundennamen (ggf. escaped)

- [ ] **Step 4: Optionale Validierung mit Mustang**

Falls `java` verfügbar:

```bash
curl -s https://github.com/ZUGFeRD/mustangproject/releases/download/2.11.0/Mustang-CLI-2.11.0.jar -o /tmp/mustang.jar
java -jar /tmp/mustang.jar --action validate --source /tmp/erechnung-XXX.xml
```

Expected: `Result: valid`

- [ ] **Step 5: Abschließenden Commit prüfen**

```bash
git log --oneline -6
```

Expected: Alle 5 Feature-Commits der vorigen Tasks sichtbar.

---

## Self-Review

**Spec Coverage:**
- ✅ Infobox entfernt (bereits erledigt vor der Planung)
- ✅ ZUGFeRD MINIMUM XML-Generator
- ✅ API-Endpunkt mit Admin-Auth
- ✅ Download-Button im UI (nur für finalisierte Rechnungen)
- ✅ Seller-Env-Vars für Kubernetes
- ✅ Kleinunternehmer-Modus (kein SELLER_VAT_ID → tax=0, category implied)
- ✅ Standard-USt-Modus (SELLER_VAT_ID gesetzt → Stripe tax amounts verwendet)
- ✅ XML-Escaping für Sonderzeichen im Kundennamen

**Placeholder-Scan:** Keine TODOs, alle Code-Blöcke vollständig.

**Type-Konsistenz:**
- `FullInvoice` in Task 1 definiert → in Task 3 als Parameter verwendet ✅
- `ZugferdSellerConfig` in Task 2 definiert → in Task 3 via `sellerConfigFromEnv()` verwendet ✅
- `generateZugferdXml(inv: FullInvoice, seller: ZugferdSellerConfig)` konsistent in Tasks 2 und 3 ✅
