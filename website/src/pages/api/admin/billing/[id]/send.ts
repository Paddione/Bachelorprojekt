import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { sendDraftInvoice } from '../../../../../lib/stripe-billing';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  await sendDraftInvoice(params.id!);
  return new Response(null, { status: 204 });
};
