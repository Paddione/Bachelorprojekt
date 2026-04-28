import { createHash } from 'node:crypto';
import { pool } from './website-db';

export interface HashableInvoice {
  id: string; number: string; brand: string; customerId: string;
  issueDate: string; dueDate: string;
  taxMode: string; netAmount: number; taxRate: number;
  taxAmount: number; grossAmount: number;
  servicePeriodStart?: string; servicePeriodEnd?: string;
}

export interface HashableLine {
  id: number; description: string;
  quantity: number; unitPrice: number; netAmount: number;
  unit?: string;
}

export function canonicalInvoiceForHash(inv: HashableInvoice, lines: HashableLine[]): string {
  const sortedLines = [...lines].sort((a, b) => a.id - b.id).map(l => ({
    id: l.id,
    description: l.description,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unitPrice),
    netAmount: Number(l.netAmount),
    unit: l.unit ?? null,
  }));
  const payload = {
    brand: inv.brand,
    customerId: inv.customerId,
    dueDate: inv.dueDate,
    grossAmount: Number(inv.grossAmount),
    id: inv.id,
    issueDate: inv.issueDate,
    lines: sortedLines,
    netAmount: Number(inv.netAmount),
    number: inv.number,
    servicePeriodEnd: inv.servicePeriodEnd ?? null,
    servicePeriodStart: inv.servicePeriodStart ?? null,
    taxAmount: Number(inv.taxAmount),
    taxMode: inv.taxMode,
    taxRate: Number(inv.taxRate),
  };
  return JSON.stringify(payload);
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export interface IntegrityResult {
  invoiceId: string;
  ok: boolean;
  storedHash: string | null;
  expectedHash: string;
}

export async function verifyInvoiceIntegrity(invoiceId: string): Promise<IntegrityResult | null> {
  const invR = await pool.query(`SELECT * FROM billing_invoices WHERE id=$1`, [invoiceId]);
  const row = invR.rows[0];
  if (!row) return null;
  const linesR = await pool.query(
    `SELECT id, description, quantity, unit_price, net_amount, unit
       FROM billing_invoice_line_items WHERE invoice_id=$1 ORDER BY id`,
    [invoiceId]
  );
  const inv: HashableInvoice = {
    id: row.id,
    number: row.number,
    brand: row.brand,
    customerId: row.customer_id,
    issueDate: (row.issue_date as Date).toISOString().split('T')[0],
    dueDate: (row.due_date as Date).toISOString().split('T')[0],
    servicePeriodStart: row.service_period_start
      ? (row.service_period_start as Date).toISOString().split('T')[0]
      : undefined,
    servicePeriodEnd: row.service_period_end
      ? (row.service_period_end as Date).toISOString().split('T')[0]
      : undefined,
    taxMode: row.tax_mode,
    netAmount: Number(row.net_amount),
    taxRate: Number(row.tax_rate),
    taxAmount: Number(row.tax_amount),
    grossAmount: Number(row.gross_amount),
  };
  const lines: HashableLine[] = linesR.rows.map((l: Record<string, unknown>) => ({
    id: Number(l.id),
    description: l.description as string,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unit_price),
    netAmount: Number(l.net_amount),
    unit: (l.unit as string) ?? undefined,
  }));
  const expected = sha256Hex(canonicalInvoiceForHash(inv, lines));
  return {
    invoiceId,
    expectedHash: expected,
    storedHash: row.hash_sha256 ?? null,
    ok: row.hash_sha256 === expected,
  };
}
