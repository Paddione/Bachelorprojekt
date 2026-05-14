import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin } from '../../../../../../../../lib/auth';
import { upsertStep } from '../../../../../../../../lib/coaching-session-db';
import { getStepDef, buildUserPrompt } from '../../../../../../../../lib/coaching-session-prompts';
import { pool } from '../../../../../../../../lib/website-db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'KI nicht konfiguriert (ANTHROPIC_API_KEY fehlt)' }), { status: 503, headers: { 'content-type': 'application/json' } });

  const sessionId = params.id as string;
  const stepNumber = parseInt(params.n as string, 10);
  if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 10) {
    return new Response(JSON.stringify({ error: 'Invalid step number' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  let body: { coachInputs: Record<string, string> };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const def = getStepDef(stepNumber);
  const userPrompt = buildUserPrompt(def, body.coachInputs);
  const model = process.env.COACHING_SESSION_MODEL || 'claude-haiku-4-5-20251001';

  let aiResponse: string;
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: 600,
      system: def.systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    aiResponse = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
  } catch (err) {
    console.error('[coaching/generate] Anthropic error:', err);
    return new Response(JSON.stringify({ error: 'KI-Anfrage fehlgeschlagen' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  const step = await upsertStep(pool, {
    sessionId, stepNumber, stepName: def.stepName, phase: def.phase,
    coachInputs: body.coachInputs, aiPrompt: userPrompt, aiResponse, status: 'generated',
  });

  return new Response(JSON.stringify({ step }), { headers: { 'content-type': 'application/json' } });
};
