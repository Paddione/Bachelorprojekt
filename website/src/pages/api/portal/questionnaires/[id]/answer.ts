import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getCustomerByEmail } from '../../../../../lib/website-db';
import { getQAssignment, upsertQAnswer, updateQAssignment } from '../../../../../lib/questionnaire-db';

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });

  const customer = await getCustomerByEmail(session.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });

  const assignment = await getQAssignment(params.id!);
  if (!assignment || assignment.customer_id !== customer.id) {
    return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  }
  if (assignment.status === 'submitted' || assignment.status === 'reviewed') {
    return new Response(JSON.stringify({ error: 'Bereits abgesendet.' }), { status: 409 });
  }

  const body = await request.json() as { question_id?: string; option_key?: string; details_text?: string };
  if (!body.question_id || !body.option_key) {
    return new Response(JSON.stringify({ error: 'question_id und option_key erforderlich.' }), { status: 400 });
  }

  await upsertQAnswer({
    assignmentId: assignment.id,
    questionId: body.question_id,
    optionKey: body.option_key,
    detailsText: body.details_text ?? null,
  });

  if (assignment.status === 'pending') {
    await updateQAssignment(assignment.id, { status: 'in_progress' });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
