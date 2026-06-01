import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { markOnboardingStep } from '../../../../lib/learning-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie') ?? '');
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  let body: { stepId?: string };
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }
  const stepId = (body.stepId ?? '').trim();
  if (!stepId) return new Response(JSON.stringify({ error: 'stepId required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  await markOnboardingStep(session.sub, session.brand ?? 'mentolder', stepId);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
