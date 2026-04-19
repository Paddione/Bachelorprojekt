import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { discardDraftInvoice } from '../../../../../lib/stripe-billing';
import { setTimeEntryStripeInvoice, getTimeEntryIdsByInvoice } from '../../../../../lib/website-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  try {
    const invoiceId = params.id!;
    const ids = await getTimeEntryIdsByInvoice(invoiceId);
    await discardDraftInvoice(invoiceId);
    await setTimeEntryStripeInvoice(ids, null);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('[billing/discard]', err);
    return Response.json({ error: 'Fehler beim Verwerfen' }, { status: 502 });
  }
};
