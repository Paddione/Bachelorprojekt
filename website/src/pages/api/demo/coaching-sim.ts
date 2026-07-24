import type { APIRoute } from 'astro';
import OpenAI from 'openai';
import { getProviderByName } from '../../../lib/provider-config';
import { getActiveProvider } from '../../../lib/coaching-ki-config-db';
import { getStepDef, isKiPromptBeat, buildUserPrompt } from '../../../lib/coaching-session-prompts';
import type { StepDefinition, KiPromptBeat } from '../../../lib/coaching-session-prompts';
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

// Größen-Caps: der Endpoint ist bewusst öffentlich (Guide-Demo, Spec coaching-sessions-polish-guide),
// daher dürfen Request-Inhalte das LLM-Prompt-Budget nicht unbegrenzt aufblähen.
const MAX_FIELD_LEN = 2000;
const MAX_INPUT_KEYS = 20;
const MAX_PREVIOUS_STEPS = 10;
const MAX_BODY_BYTES = 64 * 1024;

type SimBody = {
  mode: 'client' | 'coach';
  stepNumber: number;
  stepName: string;
  coachInputs: Record<string, string>;
  previousSteps: Array<{ stepName: string; inputs: Record<string, string>; coachResponse: string }>;
};

function isCappedStringRecord(v: unknown): v is Record<string, string> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const entries = Object.entries(v);
  if (entries.length > MAX_INPUT_KEYS) return false;
  return entries.every(([, val]) => typeof val === 'string' && val.length <= MAX_FIELD_LEN);
}

function validateSimBody(v: unknown): v is SimBody {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as Record<string, unknown>;
  if (b.mode !== 'client' && b.mode !== 'coach') return false;
  if (typeof b.stepNumber !== 'number' || !Number.isInteger(b.stepNumber) || b.stepNumber < 1 || b.stepNumber > 10) return false;
  if (typeof b.stepName !== 'string' || b.stepName.length > 100) return false;
  if (!isCappedStringRecord(b.coachInputs)) return false;
  if (!Array.isArray(b.previousSteps) || b.previousSteps.length > MAX_PREVIOUS_STEPS) return false;
  return b.previousSteps.every((s: unknown) => {
    if (typeof s !== 'object' || s === null) return false;
    const step = s as Record<string, unknown>;
    return typeof step.stepName === 'string' && step.stepName.length <= 100
      && isCappedStringRecord(step.inputs)
      && typeof step.coachResponse === 'string' && step.coachResponse.length <= 4000;
  });
}

const PERSONA_SYSTEM = `Du bist Andrea K., 42 Jahre, Teamleiterin in einem IT-Unternehmen.
Du befindest dich in einer Coaching-Session. Thema: Dein Vorgesetzter kritisiert dich seit drei Monaten regelmäßig im Teammeeting und untergräbt deinen Führungsstil vor dem Team.
Du bist emotional berührt, aber auch reflektiert. Antworte authentisch und kurz (1-3 Sätze pro Feld) aus deiner Perspektive.
Gib deine Antwort als JSON-Objekt zurück — ausschließlich die geforderten Felder, kein Freitext außerhalb des JSON.`;

const COACH_BASE = `Du bist ein erfahrener Coaching-Assistent (Triadisches KI-Coaching nach Geißler).
Deine Aufgabe: basierend auf den Coach-Eingaben eine präzise, handlungsorientierte Gesprächsintervention vorschlagen.
Sprache: Deutsch. Maximal 250 Wörter. Kein wörtliches Buchzitat. Keine allgemeinen Ratschläge — konkret zur Situation.`;

function firstKiPromptBeat(stepDef: StepDefinition): KiPromptBeat {
  const beat = stepDef.beats.find(isKiPromptBeat);
  if (!beat) throw new Error(`Step ${stepDef.stepNumber} has no ki_prompt beat`);
  return beat;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (process.env.COACHING_SIM_ENABLED === 'false') {
    return new Response(
      JSON.stringify({ error: 'Demo deaktiviert' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const ip = clientAddress ?? 'unknown';
  if (checkRateLimit(ip)) {
    return new Response(
      JSON.stringify({ error: 'Zu viele Anfragen. Bitte einen Moment warten.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ error: 'Request-Body zu groß' }),
      { status: 413, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Ungültiger Request-Body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (!validateSimBody(parsed)) {
    return new Response(
      JSON.stringify({ error: 'Ungültiger Request-Body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const body: SimBody = parsed;

  const activeConfig = await getActiveProvider(pool, process.env.BRAND ?? 'mentolder');
  if (!activeConfig) {
    return new Response(
      JSON.stringify({ error: 'Kein KI-Provider konfiguriert' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let providerCfg;
  try {
    providerCfg = await getProviderByName(activeConfig.provider);
  } catch {
    return new Response(
      JSON.stringify({ error: `Provider '${activeConfig.provider}' ist nicht aktiv` }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const client = new OpenAI({
    apiKey: providerCfg.apiKey || 'not-required',
    baseURL: providerCfg.baseUrl || undefined,
  });
  const model = providerCfg.modelId;

  try {
    let result: string;

    if (body.mode === 'client') {
      const stepDef = getStepDef(body.stepNumber);
      const beat = firstKiPromptBeat(stepDef);
      const fieldKeys = beat.inputs
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
      const beat = firstKiPromptBeat(stepDef);
      const filledPrompt = buildUserPrompt(beat, body.coachInputs, {});

      const history = body.previousSteps.flatMap(s => [
        { role: 'user' as const, content: `[${s.stepName}] ${JSON.stringify(s.inputs)}` },
        { role: 'assistant' as const, content: s.coachResponse },
      ]);

      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: activeConfig.systemPrompt ?? COACH_BASE },
          ...history,
          { role: 'user', content: filledPrompt },
        ],
        max_tokens: activeConfig.maxTokens ?? 600,
        temperature: activeConfig.temperature ?? 0.7,
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
