import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../../../lib/auth';
import { upsertStep, getStep } from '../../../../../../../../lib/coaching-session-db';
import { getStepDef } from '../../../../../../../../lib/coaching-session-prompts';
import type { BeatState } from '../../../../../../../../lib/coaching-session-beats-db';
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
  let body: {
    beatIndex?: number; captured?: string; inputs?: Record<string, string>;
    beatStatus?: BeatState['status']; status?: 'pending' | 'generated' | 'accepted' | 'skipped';
  };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const def = stepNumber > 0 ? getStepDef(stepNumber) : { stepName: 'Abschlussbericht', phase: 'umsetzung' };
  const current = await getStep(pool, sessionId, stepNumber);
  let beats: BeatState[] = current?.beats ?? [];

  if (typeof body.beatIndex === 'number' && Number.isInteger(body.beatIndex) && body.beatIndex >= 0) {
    const prev = beats.find((b) => b.beatIndex === body.beatIndex);
    const merged: BeatState = {
      beatIndex: body.beatIndex,
      captured: body.captured ?? prev?.captured,
      inputs: body.inputs ?? prev?.inputs,
      aiResponse: prev?.aiResponse ?? null,
      status: body.beatStatus ?? prev?.status ?? 'seen',
    };
    beats = [...beats.filter((b) => b.beatIndex !== body.beatIndex), merged].sort((a, b) => a.beatIndex - b.beatIndex);
  }

  const step = await upsertStep(pool, {
    sessionId, stepNumber, stepName: def.stepName, phase: def.phase,
    beats, status: body.status,
  });
  return new Response(JSON.stringify({ step }), { headers: { 'content-type': 'application/json' } });
};
