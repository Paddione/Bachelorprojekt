import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../../../lib/auth';
import { getSession as getCoachingSession, upsertStep, appendAuditLog } from '../../../../../../../../lib/coaching-session-db';
import { getActiveProvider, getKiProviderById } from '../../../../../../../../lib/coaching-ki-config-db';
import { getStepTemplate, buildPromptFromTemplate } from '../../../../../../../../lib/coaching-templates-db';
import { getStepDef, buildUserPrompt } from '../../../../../../../../lib/coaching-session-prompts';
import { getProject } from '../../../../../../../../lib/coaching-project-db';
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

  // Projekt-Kontext und Anonymisierung
  let customerNumber: string | null = null;
  let projectKiContext: string | null = null;
  if (coachingSession?.projectId) {
    try {
      const project = await getProject(pool, coachingSession.projectId);
      customerNumber = project?.customerNumber ?? null;
      projectKiContext = project?.kiContext ?? null;
    } catch { /* Projekt-Fehler blockieren keine KI-Anfrage */ }
  }

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

  // System-Prompt aus KI-Profil überschreibt Template-Prompt, wenn gesetzt
  let effectiveSystem = activeProvider?.systemPrompt || systemPrompt;
  if (customerNumber) {
    effectiveSystem = effectiveSystem.replace(/\{\{KLIENT_ID\}\}/g, customerNumber);
  }
  if (projectKiContext) {
    effectiveSystem = `${projectKiContext}\n\n${effectiveSystem}`;
  }

  const anonymizedUserPrompt = customerNumber
    ? `Klient ${customerNumber}:\n${userPrompt}`
    : userPrompt;

  const wantsStream = new URL(request.url).searchParams.get('stream') === 'true';

  const { buildSessionHistory } = await import('../../../../../../../../lib/session-history');
  const { createSessionAgent } = await import('../../../../../../../../lib/session-agent-factory');

  const history = await buildSessionHistory(sessionId, stepNumber);
  const agent = createSessionAgent(activeProvider!);

  if (wantsStream && agent.stream) {
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const streamStart = Date.now();

    (async () => {
      let fullResponse = '';
      try {
        for await (const chunk of agent.stream!({
          sessionId, stepNumber, coachInputs: body.coachInputs,
          kiConfig: activeProvider!, brand, history,
          effectiveSystemPrompt: effectiveSystem,
          assembledUserPrompt: anonymizedUserPrompt,
          stepName, phase,
        })) {
          fullResponse += chunk;
          await writer.write(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
        }
        const durationMs = Date.now() - streamStart;
        const step = await upsertStep(pool, {
          sessionId, stepNumber, stepName, phase,
          coachInputs: body.coachInputs,
          aiPrompt: anonymizedUserPrompt,
          aiResponse: fullResponse,
          status: 'generated',
        });
        await appendAuditLog(pool, {
          sessionId, eventType: 'ai_request', actor: session.preferred_username,
          stepNumber,
          payload: { provider: providerName, model: activeProvider?.modelName ?? '?', prompt: anonymizedUserPrompt, response: fullResponse, duration_ms: durationMs, streaming: true },
        });
        await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true, step, aiPrompt: anonymizedUserPrompt, durationMs })}\n\n`));
      } catch (err) {
        console.error('[coaching/generate] stream error', err);
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'Stream-Fehler' })}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' },
    });
  }

  // Non-streaming path
  let aiResponse: string;
  const startMs = Date.now();
  try {
    const result = await agent.generate({
      sessionId, stepNumber, coachInputs: body.coachInputs,
      kiConfig: activeProvider!, brand, history,
      effectiveSystemPrompt: effectiveSystem,
      assembledUserPrompt: anonymizedUserPrompt,
      stepName, phase,
    });
    aiResponse = result.aiResponse;
  } catch (err) {
    console.error('[coaching/generate]', err);
    return new Response(JSON.stringify({ error: 'KI-Anfrage fehlgeschlagen' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  const durationMs = Date.now() - startMs;

  const step = await upsertStep(pool, {
    sessionId, stepNumber, stepName, phase,
    coachInputs: body.coachInputs, aiPrompt: anonymizedUserPrompt, aiResponse, status: 'generated',
  });

  await appendAuditLog(pool, {
    sessionId, eventType: 'ai_request', actor: session.preferred_username,
    stepNumber,
    payload: { provider: providerName, model: activeProvider?.modelName ?? '?', prompt: anonymizedUserPrompt, response: aiResponse, duration_ms: durationMs },
  });

  return new Response(JSON.stringify({ step }), { headers: { 'content-type': 'application/json' } });
};
