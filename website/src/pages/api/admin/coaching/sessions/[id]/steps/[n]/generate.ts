import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../../../lib/auth';
import { getSession as getCoachingSession, upsertStep, appendAuditLog } from '../../../../../../../../lib/coaching-session-db';
import { getActiveProvider, getKiProviderById } from '../../../../../../../../lib/coaching-ki-config-db';
import { getStepTemplate, buildPromptFromTemplate } from '../../../../../../../../lib/coaching-templates-db';
import { getStepDef, buildUserPrompt } from '../../../../../../../../lib/coaching-session-prompts';
import { getProject } from '../../../../../../../../lib/coaching-project-db';
import { pool } from '../../../../../../../../lib/website-db';
import { scrubClientPii } from '../../../../../../../../lib/prompt-scrubber';

export const prerender = false;

export const POST: APIRoute = async ({ request, params , locals }) => {
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
  
  const coachingSession = await getCoachingSession(pool, sessionId);
  
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
  if (!activeProvider) {
    return new Response(JSON.stringify({ error: 'Kein KI-Provider konfiguriert' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
  const providerName = activeProvider.provider;

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

  let effectiveSystem = activeProvider?.systemPrompt || systemPrompt;
  
  // DSGVO-konformer Scrubber: Ersetze PII durch customerNumber mit name/email sources
  let piiSources: { names: string[]; emails: string[] } | null = null;
  if (customerNumber) {
    const pii: { names: string[]; emails: string[] } = { 
      names: coachingSession?.clientName ? [coachingSession.clientName] : [], 
      emails: [] as string[] 
    };
    
    // Collect client name PII sources from linked customer record
    if (coachingSession?.clientId) {
      try {
        const c = await pool.query('SELECT name, email FROM customers WHERE id = $1', [coachingSession.clientId]);
        const row = c.rows[0] as { name?: string; email?: string } | undefined;
        if (row?.name) pii.names.push(row.name);
        if (row?.email) pii.emails.push(row.email);
      } catch { /* customer lookup must not block generation */ }
    }
    
    piiSources = pii;
  }

  // Apply scrubber to effectiveSystem and userPrompt before agent call
  let anonymizedUserPromptFinal: string;
  
  if (customerNumber) {
    const replacement = customerNumber ?? '[KLIENT]';
    
    try {
      if (piiSources!.names.length || piiSources!.emails.length) {
        effectiveSystem = scrubClientPii(effectiveSystem, { names: piiSources!.names, emails: piiSources!.emails, replacement });
        anonymizedUserPromptFinal = scrubClientPii(userPrompt, { names: piiSources!.names, emails: piiSources!.emails, replacement });
      } else if (userPrompt) {
        // No PII to scrub - just add client prefix if needed
        const prefix = `Klient ${customerNumber}:`;
        anonymizedUserPromptFinal = userPrompt.startsWith(prefix) ? userPrompt : `${prefix}\n${userPrompt}`;
      } else {
        anonymizedUserPromptFinal = '';
      }
    } catch (err: unknown) {
      locals.requestLogger.error({ err }, '[coaching/generate] scrub failed');
      // Fail-closed: ohne erfolgreichen Scrub darf keine Klienten-PII ans LLM gehen (DSGVO)
      return new Response(JSON.stringify({ error: 'PII-Anonymisierung fehlgeschlagen — Anfrage abgebrochen' }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
  } else {
    anonymizedUserPromptFinal = userPrompt || '';
  }

  // Update userPrompt to include prefix if we scrubbed with replacement
  if (customerNumber && piiSources!.names.length) {
    const prefix = `Klient ${customerNumber}:`;
    userPrompt = !anonymizedUserPromptFinal.startsWith(prefix) 
      ? `${prefix}\n${anonymizedUserPromptFinal}`
      : anonymizedUserPromptFinal;
  }
  
  if (projectKiContext && !effectiveSystem.includes(projectKiContext)) {
    effectiveSystem = `${projectKiContext}\n\n${effectiveSystem}`;
  }

  const wantsStream = new URL(request.url).searchParams.get('stream') === 'true';

  const { buildSessionHistory } = await import('../../../../../../../../lib/session-history');
  const { createSessionAgent } = await import('../../../../../../../../lib/session-agent-factory');

  const history = await buildSessionHistory(sessionId, stepNumber);
  const agent = createSessionAgent(activeProvider);

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
          kiConfig: activeProvider, brand, history,
          effectiveSystemPrompt: effectiveSystem,
          assembledUserPrompt: anonymizedUserPromptFinal,
          stepName, phase,
        })) {
          fullResponse += chunk;
          await writer.write(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
        }
        const durationMs = Date.now() - streamStart;
        const step = await upsertStep(pool, {
          sessionId, stepNumber, stepName, phase,
          coachInputs: body.coachInputs,
          aiPrompt: anonymizedUserPromptFinal,
          aiResponse: fullResponse,
          status: 'generated',
        });
        await appendAuditLog(pool, {
          sessionId, eventType: 'ai_request', actor: session.preferred_username,
          stepNumber,
          payload: { provider: providerName, model: activeProvider?.modelName ?? '?', prompt: anonymizedUserPromptFinal, response: fullResponse, duration_ms: durationMs, streaming: true },
        });
        await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true, step, aiPrompt: anonymizedUserPromptFinal, durationMs })}\n\n`));
      } catch (err) {
        locals.requestLogger.error({ err }, '[coaching/generate] stream error');
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'Stream-Fehler' })}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' },
    });
  }

  let aiResponse: string;
  const startMs = Date.now();
  try {
    const result = await agent.generate({
      sessionId, stepNumber, coachInputs: body.coachInputs,
      kiConfig: activeProvider, brand, history,
      effectiveSystemPrompt: effectiveSystem,
      assembledUserPrompt: anonymizedUserPromptFinal,
      stepName, phase,
    });
    aiResponse = result.aiResponse;
  } catch (err) {
    locals.requestLogger.error({ err }, '[coaching/generate]');
    return new Response(JSON.stringify({ error: 'KI-Anfrage fehlgeschlagen' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  const durationMs = Date.now() - startMs;

  const step = await upsertStep(pool, {
    sessionId, stepNumber, stepName, phase,
    coachInputs: body.coachInputs, aiPrompt: anonymizedUserPromptFinal, aiResponse, status: 'generated',
  });

  await appendAuditLog(pool, {
    sessionId, eventType: 'ai_request', actor: session.preferred_username,
    stepNumber,
    payload: { provider: providerName, model: activeProvider?.modelName ?? '?', prompt: anonymizedUserPromptFinal, response: aiResponse, duration_ms: durationMs },
  });

  return new Response(JSON.stringify({ step }), { headers: { 'content-type': 'application/json' } });
};
