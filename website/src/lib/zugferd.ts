// DEPRECATED: kept as a one-release shim. Delete after the next minor bump.
import { generateFacturX } from './einvoice/factur-x';
import type { InvoiceInput } from './einvoice/types';

export { sellerConfigFromEnv } from './einvoice/legacy-seller';
export type { LegacySellerConfig as ZugferdSellerConfig } from './einvoice/legacy-seller';

export function generateZugferdXml(): string {
  throw new Error('generateZugferdXml is deprecated. Use generateFacturX from ./einvoice/factur-x.ts.');
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

import type { EInvoiceInput } from './einvoice-profile';

export function generateXRechnungCii(_p: EInvoiceInput): string {
  throw new Error('not implemented'); // siehe Task 4
}
