import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getCustomerByEmail } from '../../../../../lib/website-db';
import { getQAssignment, dismissQAssignment } from '../../../../../lib/questionnaire-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });

  const customer = await getCustomerByEmail(session.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });

  const assignment = await getQAssignment(params.id!);
  if (!assignment || assignment.customer_id !== customer.id) {
    return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  }
  if (assignment.status === 'submitted' || assignment.status === 'reviewed' || assignment.status === 'dismissed') {
    return new Response(JSON.stringify({ error: 'Nicht möglich.' }), { status: 409 });
  }

  let reason = '';
  try {
    const body = await request.json().catch(() => ({})) as { reason?: unknown };
    reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  } catch { /* no body */ }

  await dismissQAssignment(assignment.id, reason);

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
