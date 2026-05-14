import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../../../lib/auth';
import { upsertStep } from '../../../../../../../../lib/coaching-session-db';
import { getStepDef } from '../../../../../../../../lib/coaching-session-prompts';
import { pool } from '../../../../../../../../lib/website-db';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const sessionId = params.id as string;
  const stepNumber = parseInt(params.n as string, 10);
  if (isNaN(stepNumber) || stepNumber < 0 || stepNumber > 10) {
    return new Response(JSON.stringify({ error: 'Invalid step number' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  let body: { coachInputs?: Record<string, string>; coachNotes?: string; status?: 'pending' | 'generated' | 'accepted' | 'skipped' };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const def = stepNumber > 0 ? getStepDef(stepNumber) : { stepName: 'Abschlussbericht', phase: 'umsetzung' };
  const step = await upsertStep(pool, {
    sessionId, stepNumber, stepName: def.stepName, phase: def.phase,
    coachInputs: body.coachInputs, coachNotes: body.coachNotes, status: body.status,
  });
  return new Response(JSON.stringify({ step }), { headers: { 'content-type': 'application/json' } });
};
