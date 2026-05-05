import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool, initBillingTables } from '../../../../../lib/website-db';
import { getInvoice, createInvoice, type InvoiceLine } from '../../../../../lib/native-billing';

export const POST: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { id } = params;
  if (!id) return new Response('ID required', { status: 400 });

  try {
    const prepayment = await getInvoice(id);
    if (!prepayment) return new Response('Prepayment invoice not found', { status: 404 });
    if (prepayment.kind !== 'prepayment') return new Response('Invoice is not a prepayment', { status: 400 });

    const body = await request.json();
    const { lines, notes, dueDays = 14 } = body;

    if (!lines || !Array.isArray(lines)) {
      return new Response(JSON.stringify({ error: 'lines array required' }), { status: 400 });
    }

    // Constraint: max 1 final invoice per prepayment
    const existingFinal = await pool.query(
      `SELECT id FROM billing_invoices WHERE parent_invoice_id = $1 AND kind = 'final'`,
      [id]
    );
    if (existingFinal.rows.length > 0) {
      return new Response(JSON.stringify({ error: 'Final invoice already exists for this prepayment' }), { status: 409 });
    }

    // Calculation per §14.5 UStG: 
    // Final invoice lists all positions, then subtracts the prepayment.
    // In our implementation, the 'lines' passed here should be the FULL positions.
    // We add a negative line for the prepayment.
    
    const finalLines: InvoiceLine[] = [
      ...lines,
      {
        description: `Abzüglich Anzahlung aus Rechnung ${prepayment.number}`,
        quantity: 1,
        unitPrice: -prepayment.netAmount,
        unit: 'Pauschal'
      }
    ];

    const finalInvoice = await createInvoice({
      brand: prepayment.brand,
      customerId: prepayment.customerId,
      issueDate: new Date().toISOString().split('T')[0],
      dueDays,
      taxMode: prepayment.taxMode as any,
      taxRate: prepayment.taxRate,
      lines: finalLines,
      notes: notes || prepayment.notes,
      kind: 'final',
      parentInvoiceId: prepayment.id,
      currency: prepayment.currency,
      supplyType: prepayment.supplyType
    });

    return new Response(JSON.stringify({ success: true, data: finalInvoice }), { status: 200 });
  } catch (err: any) {
    console.error('[finalize-from-prepayment]', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), { status: 500 });
  }
};
