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
  email?: string;  // BT-34 / BG-6
  phone?: string;  // BG-6 contact
  // BT-32 — German Steuernummer for Kleinunternehmer who have no VAT ID.
  // Emitted as <SpecifiedTaxRegistration schemeID="FC"> (CII) /
  // <PartyTaxScheme><TaxScheme><ID>FC</ID></TaxScheme> (UBL).
  taxNumber?: string;
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
