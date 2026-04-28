import { pool, initBillingTables } from './website-db';
import { addBooking } from './eur-bookkeeping';

export interface InvoicePayment {
  id: number;
  invoiceId: string;
  brand: string;
  paidAt: string;
  amount: number;
  method: string;
  reference?: string;
  recordedBy: string;
  notes?: string;
}

export interface RecordPaymentInput {
  invoiceId: string;
  paidAt: string;
  amount: number;
  method: 'sepa' | 'cash' | 'bank' | 'other' | 'legacy';
  recordedBy: string;
  reference?: string;
  notes?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function recordPayment(p: RecordPaymentInput): Promise<InvoicePayment> {
  if (p.amount === 0) throw new Error('amount must be non-zero');
  if (p.amount < 0 && !p.notes) throw new Error('correction (negative) requires notes');
  await initBillingTables();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invR = await client.query(
      `SELECT * FROM billing_invoices WHERE id=$1 FOR UPDATE`, [p.invoiceId],
    );
    if (!invR.rows[0]) {
      await client.query('ROLLBACK');
      throw new Error('invoice not found');
    }
    const inv = invR.rows[0];
    if (inv.status === 'draft' || inv.status === 'cancelled') {
      await client.query('ROLLBACK');
      throw new Error(`cannot record payment on status=${inv.status}`);
    }
    const gross = Number(inv.gross_amount);
    const prevPaid = Number(inv.paid_amount ?? 0);
    const newPaid  = round2(prevPaid + p.amount);
    if (p.amount > 0 && newPaid > gross + 0.001) {
      await client.query('ROLLBACK');
      throw new Error(`payment exceeds outstanding (gross=${gross}, paid_after=${newPaid})`);
    }
    if (newPaid < 0) {
      await client.query('ROLLBACK');
      throw new Error('correction would drive paid_amount negative');
    }

    const ins = await client.query(
      `INSERT INTO billing_invoice_payments
         (invoice_id, brand, paid_at, amount, method, reference, recorded_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [p.invoiceId, inv.brand, p.paidAt, p.amount, p.method,
       p.reference ?? null, p.recordedBy, p.notes ?? null],
    );
    const payRow = ins.rows[0];

    let nextStatus: string;
    let paidAtCol: Date | null;
    if (newPaid >= gross - 0.001 && newPaid > 0) {
      nextStatus = 'paid'; paidAtCol = new Date(p.paidAt);
    } else if (newPaid > 0) {
      nextStatus = 'partially_paid'; paidAtCol = null;
    } else {
      nextStatus = 'open'; paidAtCol = null;
    }
    await client.query(
      `UPDATE billing_invoices
         SET paid_amount=$2, status=$3, paid_at=$4, updated_at=now()
       WHERE id=$1`,
      [p.invoiceId, newPaid, nextStatus, paidAtCol],
    );

    const net = Number(inv.net_amount);
    const tax = Number(inv.tax_amount);
    const eurNet = round2(p.amount * net / gross);
    const eurVat = round2(p.amount * tax / gross);
    await client.query('COMMIT');

    await addBooking({
      brand:       inv.brand,
      bookingDate: p.paidAt,
      type:        'income',
      category:    p.amount < 0 ? 'zahlungseingang_korrektur' : 'zahlungseingang',
      description: p.amount < 0
        ? `Zahlungskorrektur ${inv.number}`
        : `Zahlungseingang ${inv.number}`,
      netAmount:   eurNet,
      vatAmount:   eurVat,
      invoiceId:   p.invoiceId,
      belegnummer: inv.number,
      taxMode:     inv.tax_mode,
    });

    return {
      id: Number(payRow.id), invoiceId: payRow.invoice_id,
      brand: payRow.brand, paidAt: payRow.paid_at.toISOString().split('T')[0],
      amount: Number(payRow.amount), method: payRow.method,
      reference: payRow.reference ?? undefined,
      recordedBy: payRow.recorded_by,
      notes: payRow.notes ?? undefined,
    };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function listPayments(invoiceId: string): Promise<InvoicePayment[]> {
  await initBillingTables();
  const r = await pool.query(
    `SELECT * FROM billing_invoice_payments WHERE invoice_id=$1 ORDER BY paid_at, id`,
    [invoiceId],
  );
  return r.rows.map(row => ({
    id: Number(row.id), invoiceId: row.invoice_id, brand: row.brand,
    paidAt: row.paid_at.toISOString().split('T')[0],
    amount: Number(row.amount), method: row.method,
    reference: row.reference ?? undefined,
    recordedBy: row.recorded_by, notes: row.notes ?? undefined,
  }));
}
