import type { APIRoute } from 'astro';
import OpenAI from 'openai';
import { getActiveProvider } from '../../../lib/coaching-ki-config-db';
import { getStepDef } from '../../../lib/coaching-session-prompts';
import { pool } from '../../../lib/website-db';

export const prerender = false;

const rateMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 20;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.reset) {
    rateMap.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

const PERSONA_SYSTEM = `Du bist Andrea K., 42 Jahre, Teamleiterin in einem IT-Unternehmen.
Du befindest dich in einer Coaching-Session. Thema: Dein Vorgesetzter kritisiert dich seit drei Monaten regelmäßig im Teammeeting und untergräbt deinen Führungsstil vor dem Team.
Du bist emotional berührt, aber auch reflektiert. Antworte authentisch und kurz (1-3 Sätze pro Feld) aus deiner Perspektive.
Gib deine Antwort als JSON-Objekt zurück — ausschließlich die geforderten Felder, kein Freitext außerhalb des JSON.`;

const COACH_BASE = `Du bist ein erfahrener Coaching-Assistent (Triadisches KI-Coaching nach Geißler).
Deine Aufgabe: basierend auf den Coach-Eingaben eine präzise, handlungsorientierte Gesprächsintervention vorschlagen.
Sprache: Deutsch. Maximal 250 Wörter. Kein wörtliches Buchzitat. Keine allgemeinen Ratschläge — konkret zur Situation.`;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? 'unknown';
  if (checkRateLimit(ip)) {
    return new Response(
      JSON.stringify({ error: 'Zu viele Anfragen. Bitte einen Moment warten.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: {
    mode: 'client' | 'coach';
    stepNumber: number;
    stepName: string;
    coachInputs: Record<string, string>;
    previousSteps: Array<{ stepName: string; inputs: Record<string, string>; coachResponse: string }>;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Ungültiger Request-Body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const config = await getActiveProvider(pool, process.env.BRAND ?? 'mentolder');
  if (!config) {
    return new Response(
      JSON.stringify({ error: 'Kein KI-Provider konfiguriert' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const client = new OpenAI({
    apiKey: config.apiKey ?? 'not-required',
    baseURL: config.apiEndpoint ?? undefined,
  });
  const model = config.modelName ?? 'hermes-3';

  try {
    let result: string;

    if (body.mode === 'client') {
      const stepDef = getStepDef(body.stepNumber);
      const fieldKeys = stepDef.inputs
        .map(i => `"${i.key}": "${i.label} (kurz, authentisch)"`)
        .join(',\n  ');
      const userMsg = `Du bist in Coaching-Schritt "${body.stepName}". Beantworte als Andrea K. folgende Felder:\n{\n  ${fieldKeys}\n}\nGib nur das JSON zurück.`;

      const history = body.previousSteps.map(s => ({
        role: 'assistant' as const,
        content: `[${s.stepName}] ${JSON.stringify(s.inputs)}`,
      }));

      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: PERSONA_SYSTEM },
          ...history,
          { role: 'user', content: userMsg },
        ],
        max_tokens: 400,
        temperature: 0.8,
      });
      result = completion.choices[0]?.message?.content ?? '{}';
    } else {
      const stepDef = getStepDef(body.stepNumber);
      const filledPrompt = stepDef.userTemplate.replace(
        /\{(\w+)\}/g,
        (_, key) => body.coachInputs[key] ?? '—',
      );

      const history = body.previousSteps.flatMap(s => [
        { role: 'user' as const, content: `[${s.stepName}] ${JSON.stringify(s.inputs)}` },
        { role: 'assistant' as const, content: s.coachResponse },
      ]);

      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: config.systemPrompt ?? COACH_BASE },
          ...history,
          { role: 'user', content: filledPrompt },
        ],
        max_tokens: config.maxTokens ?? 600,
        temperature: config.temperature ?? 0.7,
      });
      result = completion.choices[0]?.message?.content ?? '';
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'KI-Fehler';
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
