import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';
import { createCustomer as createBillingCustomer, createInvoice } from '../../../../lib/native-billing';
import { createInboxItem } from '../../../../lib/messaging-db';

function jsonError(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return jsonError('Nicht autorisiert', 401);

  const brand = process.env.BRAND || 'mentolder';
  const today = new Date().toISOString().split('T')[0];

  try {
    // 1. CRM customers (customers table — no Keycloak)
    await pool.query(
      `INSERT INTO customers (name, email, phone, company)
       VALUES ($1,$2,$3,$4), ($5,$6,$7,$8)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name, company = EXCLUDED.company, updated_at = now()`,
      [
        '[TEST] Max Mustermann', 'test-max@test.invalid', '+49 111 0000001', '[TEST] Coaching AG',
        '[TEST] Erika Musterfrau', 'test-erika@test.invalid', '+49 111 0000002', '[TEST] Musterfirma GmbH',
      ]
    );
    const crmRes = await pool.query(
      `SELECT id FROM customers WHERE email IN ($1,$2)`,
      ['test-max@test.invalid', 'test-erika@test.invalid']
    );
    const [crmId1, crmId2] = crmRes.rows.map((r: { id: string }) => r.id);

    // 2. Billing customer
    const billingCustomer = await createBillingCustomer({
      brand,
      name: '[TEST] Test GmbH',
      email: 'test-billing@test.invalid',
      company: '[TEST] Test GmbH',
      addressLine1: 'Teststraße 1',
      city: 'Teststadt',
      postalCode: '12345',
    });

    // 3. Draft invoices (not finalized — keeps locked=false so purge can delete them)
    const invoiceAmounts = [
      { amount: 500, desc: '[TEST] Coaching-Einzelstunde' },
      { amount: 1200, desc: '[TEST] Coaching-Paket 3 Sitzungen' },
      { amount: 3400, desc: '[TEST] Coaching-Intensivprogramm' },
    ];
    let invoiceCount = 0;
    for (const { amount, desc } of invoiceAmounts) {
      await createInvoice({
        brand,
        customerId: billingCustomer.id,
        issueDate: today,
        dueDays: 14,
        taxMode: 'kleinunternehmer',
        lines: [{ description: desc, quantity: 1, unitPrice: amount }],
        notes: '[TEST] Automatisch generierter Testdatensatz',
      });
      invoiceCount++;
    }

    // 4. Meetings (linked to CRM customers)
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const in3days = new Date(Date.now() + 3 * 86_400_000).toISOString();
    if (crmId1 && crmId2) {
      await pool.query(
        `INSERT INTO meetings (customer_id, meeting_type, scheduled_at, status)
         VALUES ($1,$2,$3,$4), ($5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [
          crmId1, '[TEST] Erstgespräch', tomorrow, 'scheduled',
          crmId2, '[TEST] Folgegespräch', in3days, 'scheduled',
        ]
      );
    }

    // 5. Inbox bookings (Termine)
    await createInboxItem({
      type: 'booking',
      payload: {
        name: '[TEST] Max Mustermann',
        email: 'test-max@test.invalid',
        type: 'erstgespraech',
        typeLabel: '[TEST] Kostenloses Erstgespräch',
        slotStart: tomorrow,
        slotEnd: in3days,
        slotDisplay: '10:00–11:00',
        date: today,
        leistungKey: 'coaching',
        adminCreated: true,
      },
    });
    await createInboxItem({
      type: 'booking',
      payload: {
        name: '[TEST] Erika Musterfrau',
        email: 'test-erika@test.invalid',
        type: 'termin',
        typeLabel: '[TEST] Termin vor Ort',
        slotStart: in3days,
        slotEnd: in3days,
        slotDisplay: '14:00–15:00',
        date: today,
        leistungKey: 'coaching',
        adminCreated: true,
      },
    });

    return new Response(JSON.stringify({
      created: { customers: 2, billingCustomers: 1, invoices: invoiceCount, meetings: 2, bookings: 2 },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[testdata/seed]', err);
    return jsonError('Fehler beim Anlegen der Testdaten', 500);
  }
};
