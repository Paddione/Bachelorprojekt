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
      <ram:SellerTradeParty>${!p.seller.vatId && p.seller.taxNumber ? `
        <ram:ID>${esc(p.seller.taxNumber)}</ram:ID>` : ''}
        <ram:Name>${esc(p.seller.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(p.seller.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${esc(p.seller.address)}</ram:LineOne>
          <ram:CityName>${esc(p.seller.city)}</ram:CityName>
          <ram:CountryID>${esc(p.seller.country)}</ram:CountryID>
        </ram:PostalTradeAddress>${p.seller.vatId ? `
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.seller.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}${p.seller.taxNumber ? `
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(p.seller.taxNumber)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(p.buyer.name)}</ram:Name>
        <ram:PostalTradeAddress>${p.buyer.postalCode ? `
          <ram:PostcodeCode>${esc(p.buyer.postalCode)}</ram:PostcodeCode>` : ''}${p.buyer.address ? `
          <ram:LineOne>${esc(p.buyer.address)}</ram:LineOne>` : ''}${p.buyer.city ? `
          <ram:CityName>${esc(p.buyer.city)}</ram:CityName>` : ''}
          <ram:CountryID>${esc(p.buyer.country)}</ram:CountryID>
        </ram:PostalTradeAddress>${p.buyer.vatId ? `
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.buyer.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime><udt:DateTimeString format="102">${dt(p.issueDate)}</udt:DateTimeString></ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${cur}</ram:InvoiceCurrencyCode>
${taxXml}      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>${esc(p.paymentReference ? `Zahlbar bis ${p.dueDate}. Verwendungszweck: ${p.paymentReference}` : `Zahlbar bis ${p.dueDate}`)}</ram:Description>
        <ram:DueDateDateTime><udt:DateTimeString format="102">${dt(p.dueDate)}</udt:DateTimeString></ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
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

function exemptionReasonFor(cat: string): string | null {
  if (cat === 'E') return 'Kein Ausweis der Umsatzsteuer gemäß § 19 UStG.';
  if (cat === 'AE') return 'Reverse charge — VAT to be paid by recipient (Art. 196 VAT Directive 2006/112/EC).';
  if (cat === 'Z') return 'Zero-rated supply.';
  return null;
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
    const reason = exemptionReasonFor(b.cat);
    const reasonXml = reason ? `
        <ram:ExemptionReason>${esc(reason)}</ram:ExemptionReason>` : '';
    return `      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${fmt(tax)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>${reasonXml}
        <ram:BasisAmount>${fmt(b.basis)}</ram:BasisAmount>
        <ram:CategoryCode>${b.cat}</ram:CategoryCode>
        <ram:RateApplicablePercent>${fmt(b.rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
`;
  }).join('');
}
