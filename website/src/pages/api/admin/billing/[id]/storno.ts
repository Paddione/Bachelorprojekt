import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createCreditNote, generateCreditNotePdf } from '../../../../../lib/invoice-storno';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({})) as { reason?: string };
  const reason = body.reason?.trim();
  if (!reason) return new Response('reason required', { status: 400 });

  try {
    const credit = await createCreditNote(params.id!, reason, { userId: session.sub, email: session.email });
    if (!credit) return new Response('not found', { status: 404 });
    await generateCreditNotePdf(credit.id);
    return new Response(JSON.stringify({ ok: true, credit }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response((err as Error).message, { status: 409 });
  }
};
