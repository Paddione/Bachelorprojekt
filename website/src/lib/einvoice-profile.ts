import { generateZugferdXmlFromNative, generateXRechnungCii, type ZugferdNativeInput } from './zugferd';
import { generateXRechnungUbl } from './xrechnung-ubl';
import { validateLeitwegId } from './leitweg';
import type { EInvoiceInput, EInvoiceProfile } from './einvoice-types';

export type { EInvoiceProfile, EInvoiceCustomer, EInvoiceSeller, EInvoiceLine, EInvoiceInput } from './einvoice-types';

function toZugferdNativeInput(p: EInvoiceInput): ZugferdNativeInput {
  return {
    invoice: {
      number: p.invoice.number,
      issueDate: p.invoice.issueDate,
      grossAmount: p.invoice.grossAmount,
      netAmount: p.invoice.netAmount,
      taxAmount: p.invoice.taxAmount,
      taxMode: p.invoice.taxMode,
      taxRate: p.invoice.taxRate,
    },
    lines: p.lines.map(l => ({
      description: l.description,
      netAmount: l.quantity * l.unitPrice,
    })),
    customer: { name: p.customer.name, email: p.customer.email },
    seller: {
      name: p.seller.name, address: p.seller.address, postalCode: p.seller.postalCode,
      city: p.seller.city, country: p.seller.country, vatId: p.seller.vatId,
      taxNumber: p.seller.taxNumber,
    },
  };
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
      return generateZugferdXmlFromNative(toZugferdNativeInput(p));
    case 'xrechnung-cii':
      return generateXRechnungCii(p);
    case 'xrechnung-ubl':
      return generateXRechnungUbl(p);
  }
}
