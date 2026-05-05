import type { EInvoiceInput } from './einvoice-types';

const XR_UBL_CUSTOMIZATION =
  'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
const XR_UBL_PROFILE = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt2 = (n: number) => n.toFixed(2);

export function generateXRechnungUbl(p: EInvoiceInput): string {
  if (!p.customer.leitwegId) {
    throw new Error('XRechnung verlangt eine Leitweg-ID (BT-10) auf dem Käufer.');
  }
  if (!p.seller.email) {
    throw new Error('XRechnung verlangt eine Verkäufer-E-Mail (BT-34) zum Senden über PEPPOL.');
  }
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
  <cbc:BuyerReference>${esc(p.customer.leitwegId)}</cbc:BuyerReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="EM">${esc(p.seller.email)}</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(p.seller.address)}</cbc:StreetName>
        <cbc:CityName>${esc(p.seller.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(p.seller.postalCode)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(p.seller.country)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(p.seller.vatId)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(p.seller.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Name>${esc(p.seller.name)}</cbc:Name>${p.seller.phone ? `
        <cbc:Telephone>${esc(p.seller.phone)}</cbc:Telephone>` : ''}
        <cbc:ElectronicMail>${esc(p.seller.email)}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="EM">${esc(p.customer.email)}</cbc:EndpointID>
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
  </cac:AccountingCustomerParty>
  <cac:Delivery>
    <cbc:ActualDeliveryDate>${p.invoice.issueDate}</cbc:ActualDeliveryDate>
  </cac:Delivery>${paymentMeans}
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
