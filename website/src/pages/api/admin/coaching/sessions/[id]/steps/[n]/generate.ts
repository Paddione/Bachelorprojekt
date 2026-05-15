import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin } from '../../../../../../../../lib/auth';
import { upsertStep, appendAuditLog } from '../../../../../../../../lib/coaching-session-db';
import { getActiveProvider } from '../../../../../../../../lib/coaching-ki-config-db';
import { getStepTemplate, buildPromptFromTemplate } from '../../../../../../../../lib/coaching-templates-db';
import { getStepDef, buildUserPrompt } from '../../../../../../../../lib/coaching-session-prompts';
import { pool } from '../../../../../../../../lib/website-db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const sessionId = params.id as string;
  const stepNumber = parseInt(params.n as string, 10);
  if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 10) {
    return new Response(JSON.stringify({ error: 'Invalid step number' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  let body: { coachInputs: Record<string, string> };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const brand = process.env.BRAND || 'mentolder';
  const activeProvider = await getActiveProvider(pool, brand);
  const providerName = activeProvider?.provider ?? 'claude';

  const dbTemplate = await getStepTemplate(pool, brand, stepNumber);
  let systemPrompt: string;
  let userPrompt: string;
  let stepName: string;
  let phase: string;

  if (dbTemplate) {
    systemPrompt = dbTemplate.systemPrompt;
    userPrompt = buildPromptFromTemplate(dbTemplate, body.coachInputs);
    stepName = dbTemplate.stepName;
    phase = dbTemplate.phase;
  } else {
    const def = getStepDef(stepNumber);
    systemPrompt = def.systemPrompt;
    userPrompt = buildUserPrompt(def, body.coachInputs);
    stepName = def.stepName;
    phase = def.phase;
  }

  const startMs = Date.now();
  let aiResponse: string;

  try {
    if (providerName === 'claude') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht konfiguriert' }), { status: 503, headers: { 'content-type': 'application/json' } });
      const client = new Anthropic({ apiKey });
      const model = activeProvider?.modelName ?? process.env.COACHING_SESSION_MODEL ?? 'claude-haiku-4-5-20251001';
      const msg = await client.messages.create({
        model, max_tokens: 600, system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      aiResponse = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
    } else if (providerName === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return new Response(JSON.stringify({ error: 'OPENAI_API_KEY nicht konfiguriert' }), { status: 503, headers: { 'content-type': 'application/json' } });
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey });
      const model = activeProvider?.modelName ?? 'gpt-4o-mini';
      const resp = await client.chat.completions.create({
        model, max_tokens: 600,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      });
      aiResponse = resp.choices[0]?.message.content ?? '';
    } else if (providerName === 'mistral') {
      const apiKey = process.env.MISTRAL_API_KEY;
      if (!apiKey) return new Response(JSON.stringify({ error: 'MISTRAL_API_KEY nicht konfiguriert' }), { status: 503, headers: { 'content-type': 'application/json' } });
      const { Mistral } = await import('@mistralai/mistralai');
      const client = new Mistral({ apiKey });
      const model = activeProvider?.modelName ?? 'mistral-small-latest';
      const resp = await client.chat.complete({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      });
      aiResponse = (resp.choices?.[0]?.message.content as string) ?? '';
    } else if (providerName === 'lumo') {
      return new Response(JSON.stringify({ error: 'Lumo-Integration noch nicht verfügbar' }), { status: 503, headers: { 'content-type': 'application/json' } });
    } else {
      return new Response(JSON.stringify({ error: `Unbekannter Provider: '${providerName}'` }), { status: 503, headers: { 'content-type': 'application/json' } });
    }
  } catch (err) {
    console.error('[coaching/generate]', err);
    return new Response(JSON.stringify({ error: 'KI-Anfrage fehlgeschlagen' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  const durationMs = Date.now() - startMs;

  const step = await upsertStep(pool, {
    sessionId, stepNumber, stepName, phase,
    coachInputs: body.coachInputs, aiPrompt: userPrompt, aiResponse, status: 'generated',
  });

  await appendAuditLog(pool, {
    sessionId, eventType: 'ai_request', actor: session.preferred_username,
    stepNumber,
    payload: { provider: providerName, model: activeProvider?.modelName ?? '?', prompt: userPrompt, response: aiResponse, duration_ms: durationMs },
  });

  return new Response(JSON.stringify({ step }), { headers: { 'content-type': 'application/json' } });
};
