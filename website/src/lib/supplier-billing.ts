import { pool, initBillingTables } from './website-db';
import { addBooking } from './eur-bookkeeping';
import { isVorsteuerEligible } from './billing-tax';
import { logBillingEvent, type BillingActor } from './billing-audit';

export interface Supplier {
  id: string; brand: string; name: string; email?: string;
  landIso: string; ustidnr?: string; steuernummer?: string;
  iban?: string; bic?: string; bankName?: string;
  address?: string; typ: string;
}

export interface SupplierInvoice {
  id: string; brand: string; supplierId: string;
  invoiceNumber?: string; invoiceDate: string;
  leistungsdatum?: string; netAmount: number;
  vatAmount: number; grossAmount: number;
  vatRate: number; currency: string;
  description?: string; pdfPath?: string;
  status: string; paidAt?: string; locked: boolean;
}

function mapSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: row.id as string, brand: row.brand as string, name: row.name as string,
    email: (row.email as string) ?? undefined, landIso: row.land_iso as string,
    ustidnr: (row.ustidnr as string) ?? undefined, steuernummer: (row.steuernummer as string) ?? undefined,
    iban: (row.iban as string) ?? undefined, bic: (row.bic as string) ?? undefined,
    bankName: (row.bank_name as string) ?? undefined, address: (row.address as string) ?? undefined,
    typ: row.typ as string,
  };
}

function mapSupplierInvoice(row: Record<string, unknown>): SupplierInvoice {
  const toDate = (v: unknown) => v ? (v as Date).toISOString().split('T')[0] : undefined;
  return {
    id: row.id as string, brand: row.brand as string, supplierId: row.supplier_id as string,
    invoiceNumber: (row.invoice_number as string) ?? undefined,
    invoiceDate: toDate(row.invoice_date)!,
    leistungsdatum: toDate(row.leistungsdatum),
    netAmount: Number(row.net_amount),
    vatAmount: Number(row.vat_amount),
    grossAmount: Number(row.gross_amount),
    vatRate: Number(row.vat_rate),
    currency: row.currency as string,
    description: (row.description as string) ?? undefined,
    pdfPath: (row.pdf_path as string) ?? undefined,
    status: row.status as string,
    paidAt: toDate(row.paid_at),
    locked: Boolean(row.locked),
  };
}

export async function createSupplier(p: Partial<Supplier> & { brand: string, name: string }): Promise<Supplier> {
  await initBillingTables();
  const r = await pool.query(
    `INSERT INTO billing_suppliers (brand, name, email, land_iso, ustidnr, steuernummer, iban, bic, bank_name, address, typ)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (brand, name) DO UPDATE SET
       email=EXCLUDED.email, land_iso=EXCLUDED.land_iso, ustidnr=EXCLUDED.ustidnr,
       steuernummer=EXCLUDED.steuernummer, iban=EXCLUDED.iban, bic=EXCLUDED.bic,
       bank_name=EXCLUDED.bank_name, address=EXCLUDED.address, typ=EXCLUDED.typ,
       updated_at=now()
     RETURNING *`,
    [p.brand, p.name, p.email??null, p.landIso??'DE', p.ustidnr??null, p.steuernummer??null, p.iban??null, p.bic??null, p.bankName??null, p.address??null, p.typ??'Lieferant']
  );
  return mapSupplier(r.rows[0]);
}

export async function getSupplierById(brand: string, id: string): Promise<Supplier | null> {
  await initBillingTables();
  const r = await pool.query(`SELECT * FROM billing_suppliers WHERE id=$1 AND brand=$2`, [id, brand]);
  return r.rows[0] ? mapSupplier(r.rows[0]) : null;
}

export async function recordSupplierInvoice(p: Omit<SupplierInvoice, 'id' | 'status' | 'locked' | 'paidAt'>): Promise<SupplierInvoice> {
  await initBillingTables();
  const r = await pool.query(
    `INSERT INTO supplier_invoices
       (brand, supplier_id, invoice_number, invoice_date, leistungsdatum, net_amount, vat_amount, gross_amount, vat_rate, currency, description, pdf_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [p.brand, p.supplierId, p.invoiceNumber??null, p.invoiceDate, p.leistungsdatum??null, p.netAmount, p.vatAmount, p.grossAmount, p.vatRate, p.currency, p.description??null, p.pdfPath??null]
  );
  return mapSupplierInvoice(r.rows[0]);
}

export async function markSupplierInvoicePaid(id: string, paidAt: string, actor?: BillingActor): Promise<SupplierInvoice | null> {
  await initBillingTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invR = await client.query(`SELECT * FROM supplier_invoices WHERE id=$1 FOR UPDATE`, [id]);
    const inv = invR.rows[0];
    if (!inv || inv.status === 'paid') { await client.query('ROLLBACK'); return inv ? mapSupplierInvoice(inv) : null; }

    const supplier = await getSupplierById(inv.brand, inv.supplier_id);
    if (!supplier) throw new Error('Supplier not found');

    const upd = await client.query(
      `UPDATE supplier_invoices SET status='paid', paid_at=$2, locked=true, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, paidAt]
    );
    
    // EÜR linkage: Betriebsausgabe with Vorsteuer split if eligible
    const eligible = isVorsteuerEligible(supplier.landIso);
    await addBooking({
      brand: inv.brand,
      bookingDate: paidAt,
      type: 'expense',
      category: 'betriebsausgabe',
      description: `Lieferant: ${supplier.name}${inv.invoice_number ? ' (Nr. ' + inv.invoice_number + ')' : ''}`,
      netAmount: Number(inv.net_amount),
      vatAmount: eligible ? Number(inv.vat_amount) : 0,
      belegnummer: inv.invoice_number ?? undefined,
    });

    await client.query('COMMIT');
    return mapSupplierInvoice(upd.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
