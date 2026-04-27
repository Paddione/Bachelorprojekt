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

export interface ZugferdNativeInput {
  invoice: { number:string; issueDate:string; grossAmount:number; netAmount:number; taxAmount:number; taxMode:string; taxRate:number };
  lines: Array<{ description:string; netAmount:number }>;
  customer: { name:string; email:string };
  seller: ZugferdSellerConfig;
}

export function generateZugferdXmlFromNative(p: ZugferdNativeInput): string {
  const isKlein = p.invoice.taxMode === 'kleinunternehmer';
  const currency = 'EUR';
  const grandTotal = fmt(p.invoice.grossAmount);
  const taxBasis   = isKlein ? grandTotal : fmt(p.invoice.netAmount);
  const taxTotal   = isKlein ? '0.00' : fmt(p.invoice.taxAmount);
  const taxRate    = isKlein ? '0' : fmt(p.invoice.taxRate);

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
    <ram:ID>${esc(p.invoice.number)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${toZugferdDate(p.invoice.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>${isKlein ? `
    <ram:IncludedNote>
      <ram:Content>Kein Ausweis der Umsatzsteuer gemäß § 19 UStG.</ram:Content>
    </ram:IncludedNote>` : ''}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc(p.customer.email)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${esc(p.seller.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(p.seller.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${esc(p.seller.address)}</ram:LineOne>
          <ram:CityName>${esc(p.seller.city)}</ram:CityName>
          <ram:CountryID>${esc(p.seller.country)}</ram:CountryID>
        </ram:PostalTradeAddress>${p.seller.vatId ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(p.seller.vatId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(p.customer.name)}</ram:Name>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${taxTotal}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${taxBasis}</ram:BasisAmount>
        <ram:CategoryCode>${isKlein ? 'E' : 'S'}</ram:CategoryCode>
        <ram:RateApplicablePercent>${taxRate}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
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
