import type { APIRoute } from 'astro';
import { getOrCreateClient, createInvoice, createQuote, SERVICES } from '../../../lib/invoiceninja';
import type { ServiceKey } from '../../../lib/invoiceninja';

// Create an invoice or quote for a service booking.
// Called after admin approves a service booking.
//
// Body: {
//   name, email, phone?, company?, address1?, city?, postalCode?, vatNumber?,
//   serviceKey, quantity?, asQuote?, sendEmail?
// }
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const {
      name, email, phone, company, address1, city, postalCode, vatNumber,
      serviceKey, quantity, asQuote, sendEmail: shouldSendEmail,
    } = body;

    if (!name || !email || !serviceKey) {
      return new Response(
        JSON.stringify({ error: 'name, email, and serviceKey required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!(serviceKey in SERVICES)) {
      return new Response(
        JSON.stringify({ error: `Unknown service: ${serviceKey}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get or create InvoiceNinja client
    const client = await getOrCreateClient({
      name, email, phone, company, address1, city, postalCode, vatNumber,
    });

    if (!client) {
      return new Response(
        JSON.stringify({ error: 'InvoiceNinja client could not be created. Is the API configured?' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create invoice or quote
    const key = serviceKey as ServiceKey;
    if (asQuote) {
      const quote = await createQuote({
        clientId: client.id,
        serviceKey: key,
        quantity: quantity || 1,
        sendEmail: shouldSendEmail !== false,
      });

      return new Response(
        JSON.stringify({ success: true, type: 'quote', data: quote }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const invoice = await createInvoice({
      clientId: client.id,
      serviceKey: key,
      quantity: quantity || 1,
      sendEmail: shouldSendEmail !== false,
    });

    return new Response(
      JSON.stringify({ success: true, type: 'invoice', data: invoice }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Billing error:', err);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
