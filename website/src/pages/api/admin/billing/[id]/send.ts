import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { sendDraftInvoice } from '../../../../../lib/stripe-billing';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  try {
    await sendDraftInvoice(params.id!);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('[billing/send]', err);
    return Response.json({ error: 'Stripe-Fehler beim Versenden' }, { status: 502 });
  }
};
