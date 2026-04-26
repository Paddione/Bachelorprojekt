import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  getQAssignment, updateQAssignment,
  listQDimensions, listQQuestions,
  listQAnswerOptionsForTemplate, listQAnswers,
} from '../../../../../lib/questionnaire-db';
import { computeScores } from '../../../../../lib/compute-scores';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const assignment = await getQAssignment(params.id!);
  if (!assignment) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });

  const [dimensions, questions, allOptions, answers] = await Promise.all([
    listQDimensions(assignment.template_id),
    listQQuestions(assignment.template_id),
    listQAnswerOptionsForTemplate(assignment.template_id),
    listQAnswers(assignment.id),
  ]);

  const scores = computeScores(dimensions, allOptions, answers);

  return new Response(JSON.stringify({ assignment, questions, answers, scores }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const body = await request.json() as { status?: string; coach_notes?: string };
  const updated = await updateQAssignment(params.id!, {
    status: body.status as 'reviewed' | undefined,
    coachNotes: body.coach_notes,
  });
  if (!updated) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};
