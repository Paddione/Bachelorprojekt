import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';

function jsonError(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export const DELETE: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return jsonError('Nicht autorisiert', 401);

  try {
    // 1. Inbox bookings where payload.name starts with [TEST]
    const bookingRes = await pool.query(
      `DELETE FROM inbox_items WHERE payload->>'name' LIKE '[TEST]%' RETURNING id`
    );

    // 2. Meetings linked to [TEST] CRM customers
    const meetingRes = await pool.query(
      `DELETE FROM meetings
       WHERE customer_id IN (SELECT id FROM customers WHERE name LIKE '[TEST]%')
       RETURNING id`
    );

    // 3. Find unlocked [TEST] invoices (locked=false only — GoBD blocks locked ones)
    const lockedRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM billing_invoices i
       JOIN billing_customers c ON c.id = i.customer_id
       WHERE c.name LIKE '[TEST]%' AND i.locked = true`
    );
    const skippedLocked = parseInt(lockedRes.rows[0]?.cnt ?? '0', 10);

    // 4. Line items for unlocked [TEST] invoices
    const lineRes = await pool.query(
      `DELETE FROM billing_invoice_line_items
       WHERE invoice_id IN (
         SELECT i.id FROM billing_invoices i
         JOIN billing_customers c ON c.id = i.customer_id
         WHERE c.name LIKE '[TEST]%' AND i.locked = false
       )
       RETURNING id`
    );

    // 5. Unlocked [TEST] invoices
    const invoiceRes = await pool.query(
      `DELETE FROM billing_invoices i
       USING billing_customers c
       WHERE c.id = i.customer_id AND c.name LIKE '[TEST]%' AND i.locked = false
       RETURNING i.id`
    );

    // 6. [TEST] billing customers (after invoices are gone)
    const billingCustRes = await pool.query(
      `DELETE FROM billing_customers WHERE name LIKE '[TEST]%' RETURNING id`
    );

    // 7. [TEST] CRM customers
    const crmCustRes = await pool.query(
      `DELETE FROM customers WHERE name LIKE '[TEST]%' RETURNING id`
    );

    return new Response(JSON.stringify({
      deleted: {
        bookings:         bookingRes.rowCount ?? 0,
        meetings:         meetingRes.rowCount ?? 0,
        invoiceLines:     lineRes.rowCount ?? 0,
        invoices:         invoiceRes.rowCount ?? 0,
        billingCustomers: billingCustRes.rowCount ?? 0,
        customers:        crmCustRes.rowCount ?? 0,
      },
      skipped: { lockedInvoices: skippedLocked },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[testdata/purge]', err);
    return jsonError('Fehler beim Löschen der Testdaten', 500);
  }
};
