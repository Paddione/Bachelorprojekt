import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin } from '../../../../../../../../lib/auth';
import { getSession as getCoachingSession, upsertStep, appendAuditLog } from '../../../../../../../../lib/coaching-session-db';
import { getActiveProvider, getKiProviderById } from '../../../../../../../../lib/coaching-ki-config-db';
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

  // Session-spezifischen KI-Provider laden oder auf aktiven zurückfallen
  const coachingSession = await getCoachingSession(pool, sessionId);
  const activeProvider = coachingSession?.kiConfigId
    ? (await getKiProviderById(pool, coachingSession.kiConfigId)) ?? await getActiveProvider(pool, brand)
    : await getActiveProvider(pool, brand);
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

  // System-Prompt aus KI-Profil überschreibt Template-Prompt, wenn gesetzt
  const effectiveSystem = activeProvider?.systemPrompt || systemPrompt;

  try {
    if (providerName === 'claude') {
      const apiKey = activeProvider?.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht konfiguriert' }), { status: 503, headers: { 'content-type': 'application/json' } });
      const clientOpts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
      if (activeProvider?.apiEndpoint) clientOpts.baseURL = activeProvider.apiEndpoint;
      const client = new Anthropic(clientOpts);
      const model = activeProvider?.modelName ?? process.env.COACHING_SESSION_MODEL ?? 'claude-haiku-4-5-20251001';
      const msg = await client.messages.create({
        model,
        max_tokens: activeProvider?.maxTokens ?? 600,
        system: effectiveSystem,
        temperature: activeProvider?.temperature ?? undefined,
        top_p: activeProvider?.topP ?? undefined,
        top_k: activeProvider?.topK ?? undefined,
        messages: [{ role: 'user', content: userPrompt }],
      } as Parameters<typeof client.messages.create>[0]);
      aiResponse = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
    } else if (providerName === 'openai') {
      const apiKey = activeProvider?.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) return new Response(JSON.stringify({ error: 'OPENAI_API_KEY nicht konfiguriert' }), { status: 503, headers: { 'content-type': 'application/json' } });
      const { default: OpenAI } = await import('openai');
      const clientOpts: ConstructorParameters<typeof OpenAI>[0] = { apiKey };
      if (activeProvider?.apiEndpoint) clientOpts.baseURL = activeProvider.apiEndpoint;
      if (activeProvider?.organizationId) clientOpts.organization = activeProvider.organizationId;
      const client = new OpenAI(clientOpts);
      const model = activeProvider?.modelName ?? 'gpt-4o-mini';
      const resp = await client.chat.completions.create({
        model,
        max_tokens: activeProvider?.maxTokens ?? 600,
        temperature: activeProvider?.temperature ?? undefined,
        top_p: activeProvider?.topP ?? undefined,
        presence_penalty: activeProvider?.presencePenalty ?? undefined,
        frequency_penalty: activeProvider?.frequencyPenalty ?? undefined,
        messages: [{ role: 'system', content: effectiveSystem }, { role: 'user', content: userPrompt }],
      });
      aiResponse = resp.choices[0]?.message.content ?? '';
    } else if (providerName === 'mistral') {
      const apiKey = activeProvider?.apiKey ?? process.env.MISTRAL_API_KEY;
      if (!apiKey) return new Response(JSON.stringify({ error: 'MISTRAL_API_KEY nicht konfiguriert' }), { status: 503, headers: { 'content-type': 'application/json' } });
      const { Mistral } = await import('@mistralai/mistralai');
      const clientOpts: ConstructorParameters<typeof Mistral>[0] = { apiKey };
      if (activeProvider?.apiEndpoint) clientOpts.serverURL = activeProvider.apiEndpoint;
      const client = new Mistral(clientOpts);
      const model = activeProvider?.modelName ?? 'mistral-small-latest';
      const resp = await client.chat.complete({
        model,
        maxTokens: activeProvider?.maxTokens ?? undefined,
        temperature: activeProvider?.temperature ?? undefined,
        topP: activeProvider?.topP ?? undefined,
        randomSeed: activeProvider?.randomSeed ?? undefined,
        safePrompt: activeProvider?.safePrompt ?? false,
        messages: [{ role: 'system', content: effectiveSystem }, { role: 'user', content: userPrompt }],
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
