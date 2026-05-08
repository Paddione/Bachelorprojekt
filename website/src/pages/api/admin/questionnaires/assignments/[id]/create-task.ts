import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getQAssignment, getQQuestion } from '../../../../../../lib/questionnaire-db';
import { createProjectTask } from '../../../../../../lib/website-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const assignment = await getQAssignment(params.id!).catch(() => null);
  if (!assignment) return new Response(JSON.stringify({ error: 'Auftrag nicht gefunden.' }), { status: 404 });
  if (!assignment.project_id) {
    return new Response(JSON.stringify({ error: 'Kein Projekt verknüpft.' }), { status: 409 });
  }

  const body = await request.json() as { questionId?: string };
  if (!body.questionId) {
    return new Response(JSON.stringify({ error: 'questionId erforderlich.' }), { status: 400 });
  }

  const question = await getQQuestion(body.questionId).catch(() => null);
  if (!question) return new Response(JSON.stringify({ error: 'Frage nicht gefunden.' }), { status: 404 });

  if (question.template_id !== assignment.template_id) {
    return new Response(JSON.stringify({ error: 'Frage gehört nicht zu diesem Auftrag.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const taskName = question.question_text.length > 120
    ? question.question_text.slice(0, 117) + '…'
    : question.question_text;

  const taskId = await createProjectTask({
    projectId: assignment.project_id,
    name: taskName,
    description: question.test_expected_result ?? undefined,
    status: 'entwurf',
    priority: 'mittel',
  });

  return new Response(JSON.stringify({ taskId }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
