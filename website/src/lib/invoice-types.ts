// website/src/lib/invoice-types.ts
// Invoice domain types extracted from native-billing.ts (G-CQ07) so invoice-pdf.ts
// can import the type without creating a static dependency on native-billing
// (which dynamically imports invoice-pdf for embedFacturX). Leaf module —
// imports nothing project-internal.

export interface InvoiceLine {
  description: string; quantity: number; unitPrice: number; unit?: string;
  taxCategory?: string;
}

export interface Invoice {
  id: string; brand: string; number: string; status: string;
  customerId: string; issueDate: string; dueDate: string;
  taxMode: string; netAmount: number; taxRate: number;
  taxAmount: number; grossAmount: number; notes?: string;
  paymentReference?: string; paidAt?: string; paidAmount?: number;
  locked: boolean; cancelledInvoiceId?: string;
  servicePeriodStart?: string; servicePeriodEnd?: string;
  leitwegId?: string;
  currency: string;
  currencyRate: number | null;
  netAmountEur: number;
  grossAmountEur: number;
  supplyType?: string;
  kind: 'regular' | 'prepayment' | 'final' | 'gutschrift';
  parentInvoiceId?: string;
}
