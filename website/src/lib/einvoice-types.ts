// Shared types for the e-invoice subsystem. Leaf module — imports nothing project-internal.

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
