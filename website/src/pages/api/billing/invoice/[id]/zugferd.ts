import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getFullInvoice } from '../../../../../lib/stripe-billing';
import { generateZugferdXml, sellerConfigFromEnv } from '../../../../../lib/zugferd';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const invoiceId = params.id;
  if (!invoiceId) {
    return new Response(JSON.stringify({ error: 'Missing invoice ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const inv = await getFullInvoice(invoiceId);
  if (!inv) {
    return new Response(JSON.stringify({ error: 'Invoice not found or Stripe not configured' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const seller = sellerConfigFromEnv();
  const xml = generateZugferdXml(inv, seller);
  const filename = `erechnung-${inv.number || invoiceId}.xml`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
