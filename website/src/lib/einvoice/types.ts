import { z } from 'zod';

export const LEITWEG_ID_REGEX = /^\d{2,12}(-\d{1,30})?(-\d{1,3})?$/;

export const SellerConfigSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  postalCode: z.string().min(1),
  city: z.string().min(1),
  country: z.string().length(2),
  vatId: z.string().optional(),
  taxNumber: z.string().optional(),
  contactEmail: z.string().email(),
  iban: z.string().min(15),
  bic: z.string().optional(),
});
export type SellerConfig = z.infer<typeof SellerConfigSchema>;

export const BuyerConfigSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().length(2).default('DE'),
  vatId: z.string().optional(),
  leitwegId: z.string().regex(LEITWEG_ID_REGEX).optional(),
});
export type BuyerConfig = z.infer<typeof BuyerConfigSchema>;

export const InvoiceLineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().default('C62'),
  unitPrice: z.number(),
  netAmount: z.number(),
  taxRate: z.number().min(0).max(100),
  taxCategory: z.enum(['S', 'E', 'AE', 'Z']),
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

export const InvoiceInputSchema = z.object({
  number: z.string().min(1),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3).default('EUR'),
  taxMode: z.enum(['kleinunternehmer', 'regelbesteuerung']),
  servicePeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  servicePeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentReference: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(InvoiceLineSchema).min(1),
  netTotal: z.number(),
  taxTotal: z.number(),
  grossTotal: z.number(),
  seller: SellerConfigSchema,
  buyer: BuyerConfigSchema,
});
export type InvoiceInput = z.infer<typeof InvoiceInputSchema>;
