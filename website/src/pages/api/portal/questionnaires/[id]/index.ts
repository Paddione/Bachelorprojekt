import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getCustomerByEmail } from '../../../../../lib/website-db';
import {
  getQAssignment, getQTemplate,
  listQQuestions, listQAnswers,
} from '../../../../../lib/questionnaire-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });

  const customer = await getCustomerByEmail(session.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });

  const assignment = await getQAssignment(params.id!);
  if (!assignment || assignment.customer_id !== customer.id) {
    return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  }

  const tpl = await getQTemplate(assignment.template_id);
  const [questions, answers] = await Promise.all([
    listQQuestions(assignment.template_id),
    listQAnswers(assignment.id),
  ]);

  return new Response(JSON.stringify({
    assignment,
    instructions: tpl?.instructions ?? '',
    questions,
    answers,
  }), { headers: { 'Content-Type': 'application/json' } });
};
