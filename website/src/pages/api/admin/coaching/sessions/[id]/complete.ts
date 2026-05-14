import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getSession as getCoachingSession, completeSession } from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const sessionId = params.id as string;
  const coachingSession = await getCoachingSession(pool, sessionId);
  if (!coachingSession) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let report = '# Abschlussbericht\n\n*(KI nicht verfügbar — bitte manuell ergänzen)*';

  if (apiKey) {
    const stepsText = coachingSession.steps
      .filter(s => s.stepNumber > 0)
      .map(s => `## Schritt ${s.stepNumber}: ${s.stepName}\n**Eingaben:** ${JSON.stringify(s.coachInputs)}\n**KI:** ${s.aiResponse ?? '—'}\n**Coach-Notiz:** ${s.coachNotes ?? '—'}`)
      .join('\n\n');

    try {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: process.env.COACHING_SESSION_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: `Du bist ein Coaching-Protokollant. Erstelle aus den 10 Schritten einer Coaching-Session eine strukturierte Zusammenfassung auf Deutsch.
Abschnitte: ## Ausgangslage, ## Analyse, ## Lösungsansatz, ## Vereinbarte Schritte, ## Bewertung.
Maximal 600 Wörter. Konkret und handlungsorientiert.`,
        messages: [{ role: 'user', content: stepsText }],
      });
      report = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
    } catch (err) {
      console.error('[coaching/complete] Report generation failed:', err);
    }
  }

  await completeSession(pool, sessionId, report);
  return new Response(JSON.stringify({ ok: true, sessionId }), { headers: { 'content-type': 'application/json' } });
};
