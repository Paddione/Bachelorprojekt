import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getSession as getCoachingSession, completeSession } from '../../../../../../lib/coaching-session-db';
import { DEFAULT_CLAUDE_SESSION_MODEL } from '../../../../../../lib/claude-session-agent';
import { pool } from '../../../../../../lib/website-db';
import { getProviderByName } from '../../../../../../lib/provider-config';

export const prerender = false;

export const POST: APIRoute = async ({ request, params , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const sessionId = params.id as string;
  const coachingSession = await getCoachingSession(pool, sessionId);
  if (!coachingSession) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }

  // Step 0 aiResponse wird nur von completeSession selbst geschrieben — dieser Branch greift
  // also nur bei einem wiederholten Complete-Aufruf und macht ihn idempotent (kein zweiter LLM-Call).
  const existingReport = coachingSession.steps.find(s => s.stepNumber === 0 && s.aiResponse);
  if (existingReport?.aiResponse) {
    await completeSession(pool, sessionId, existingReport.aiResponse);
    return new Response(JSON.stringify({ ok: true, sessionId }), { headers: { 'content-type': 'application/json' } });
  }

  // Legacy fallback: generate report inline (non-Claude providers or tool not called)
  let report = '# Abschlussbericht\n\n*(KI nicht verfügbar — bitte manuell ergänzen)*';

  let apiKey: string | undefined;
  let resolvedModel: string | undefined;
  try {
    const cfg = await getProviderByName('anthropic');
    apiKey = cfg.apiKey || undefined;
    resolvedModel = cfg.modelId;
  } catch {
    apiKey = process.env.ANTHROPIC_API_KEY;
  }

  if (apiKey) {
    const stepsText = coachingSession.steps
      .filter(s => s.stepNumber > 0)
      .map(s => `## Schritt ${s.stepNumber}: ${s.stepName}\n**Eingaben:** ${JSON.stringify(s.coachInputs)}\n**KI:** ${s.aiResponse ?? '—'}\n**Coach-Notiz:** ${s.coachNotes ?? '—'}`)
      .join('\n\n');

    try {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: resolvedModel ?? process.env.COACHING_SESSION_MODEL ?? DEFAULT_CLAUDE_SESSION_MODEL,
        max_tokens: 1200,
        system: `Du bist ein Coaching-Protokollant. Erstelle aus den 10 Schritten einer Coaching-Session eine strukturierte Zusammenfassung auf Deutsch.
Abschnitte: ## Ausgangslage, ## Analyse, ## Lösungsansatz, ## Vereinbarte Schritte, ## Bewertung.
Maximal 600 Wörter. Konkret und handlungsorientiert.`,
        messages: [{ role: 'user', content: stepsText }],
      });
      report = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
    } catch (err) {
      locals.requestLogger.error({ err }, '[coaching/complete] Report generation failed:');
    }
  }

  await completeSession(pool, sessionId, report);
  return new Response(JSON.stringify({ ok: true, sessionId }), { headers: { 'content-type': 'application/json' } });
};
