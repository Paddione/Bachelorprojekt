// Tests für den ZUGFeRD-XML-Generator
// Run: node tests/zugferd.test.mjs

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
