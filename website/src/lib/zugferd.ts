// DEPRECATED: kept as a one-release shim. Delete after the next minor bump.
import { generateFacturX } from './einvoice/factur-x';
import type { InvoiceInput } from './einvoice/types';
import type { EInvoiceInput } from './einvoice-types';

export { sellerConfigFromEnv } from './einvoice/legacy-seller';
export type { LegacySellerConfig as ZugferdSellerConfig } from './einvoice/legacy-seller';

export function generateZugferdXml(): string {
  throw new Error('generateZugferdXml is deprecated. Use generateFacturX from ./einvoice/factur-x.ts.');
}

// Local type — only the fields used in generateZugferdXmlLegacy
interface FullInvoice {
  number: string;
  date: string;
  amountDue: number;
  subtotalExclTax: number;
  taxAmount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
}

export function generateZugferdXmlFromNative(input: any): string {
  const mapped: InvoiceInput = {
    number: input.invoice.number,
    issueDate: input.invoice.issueDate,
    dueDate: input.invoice.dueDate ?? input.invoice.issueDate,
    currency: 'EUR',
    taxMode: input.invoice.taxMode,
    lines: input.lines.map((l: any) => ({
      description: l.description,
      quantity: l.quantity || 1,
      unit: 'C62',
      unitPrice: l.unitPrice ?? l.netAmount,
      netAmount: l.netAmount,
      taxRate: input.invoice.taxMode === 'kleinunternehmer' ? 0 : input.invoice.taxRate,
      taxCategory: input.invoice.taxMode === 'kleinunternehmer' ? 'E' : 'S',
    })),
    netTotal: input.invoice.netAmount,
    taxTotal: input.invoice.taxAmount,
    grossTotal: input.invoice.grossAmount,
    seller: {
      name: input.seller.name,
      address: input.seller.address,
      postalCode: input.seller.postalCode,
      city: input.seller.city,
      country: input.seller.country,
      vatId: input.seller.vatId || undefined,
      contactEmail: 'contact@example.com',
      iban: 'DE12345678901234567890',
    },
    buyer: {
      name: input.customer.name,
      email: input.customer.email,
    },
  };
  return generateFacturX(mapped);
}

const XR_CII_GUIDELINE =
  'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0';

export function generateXRechnungCii(p: EInvoiceInput): string {
  if (!p.customer.leitwegId) {
    throw new Error('XRechnung verlangt eine Leitweg-ID (BT-10) auf dem Käufer.');
  }
  if (!p.seller.email) {
    throw new Error('XRechnung verlangt eine Verkäufer-E-Mail (BT-34) zum Senden über PEPPOL.');
  }
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
    <ram:BusinessProcessSpecifiedDocumentContextParameter>
      <ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID>
    </ram:BusinessProcessSpecifiedDocumentContextParameter>
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
      <ram:BuyerReference>${esc(p.customer.leitwegId)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${esc(p.seller.name)}</ram:Name>
        <ram:DefinedTradeContact>
          <ram:PersonName>${esc(p.seller.name)}</ram:PersonName>${p.seller.phone ? `
          <ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(p.seller.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : ''}
          <ram:EmailURIUniversalCommunication><ram:URIID>${esc(p.seller.email)}</ram:URIID></ram:EmailURIUniversalCommunication>
        </ram:DefinedTradeContact>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(p.seller.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${esc(p.seller.address)}</ram:LineOne>
          <ram:CityName>${esc(p.seller.city)}</ram:CityName>
          <ram:CountryID>${esc(p.seller.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${esc(p.seller.email)}</ram:URIID>
        </ram:URIUniversalCommunication>
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
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${esc(p.customer.email)}</ram:URIID>
        </ram:URIUniversalCommunication>
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
