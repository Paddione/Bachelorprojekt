import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const CLASSIFIER_VERSION = 'v1-2026-05-10';
export const DEFAULT_MODEL = process.env.COACHING_CLASSIFIER_MODEL || 'claude-haiku-4-5-20251001';

export type TemplateKind = 'reflection' | 'dialog_pattern' | 'exercise' | 'case_example';
export type ClassifierKind = TemplateKind | 'theory' | 'noise';

const ReflectionPayload = z.object({
  title: z.string().min(3).max(120),
  question: z.string().min(8).max(500),
  follow_up: z.string().min(0).max(500).nullable().optional(),
});
const DialogPayload = z.object({
  title: z.string().min(3).max(120),
  coach_line: z.string().min(5).max(500),
  client_response_pattern: z.string().min(5).max(500),
  next_move: z.string().min(5).max(500),
});
const ExercisePayload = z.object({
  title: z.string().min(3).max(120),
  phases: z.array(z.object({ name: z.string().min(2).max(60), instruction: z.string().min(5).max(500) })).min(1).max(8),
  duration_min: z.number().int().min(1).max(240).nullable().optional(),
});
const CasePayload = z.object({
  title: z.string().min(3).max(120),
  summary: z.string().min(20).max(800),
  client_archetype: z.string().min(0).max(120).nullable().optional(),
});

const PayloadByKind: Record<TemplateKind, z.ZodTypeAny> = {
  reflection: ReflectionPayload,
  dialog_pattern: DialogPayload,
  exercise: ExercisePayload,
  case_example: CasePayload,
};

const ClassifierEnvelope = z.object({
  kind: z.enum(['reflection', 'dialog_pattern', 'exercise', 'case_example', 'theory', 'noise']),
  payload: z.record(z.unknown()).optional(),
  reason: z.string().max(280).optional(),
});

export interface ClassifierResult {
  kind: ClassifierKind;
  payload: Record<string, unknown> | null;
  model: string;
  version: string;
  reason?: string;
}

const SYSTEM_PROMPT = `Du bist ein Klassifikator für Coaching-Buchstellen. Lies den Chunk und antworte mit GENAU EINEM JSON-Objekt der Form:
{"kind": "<reflection|dialog_pattern|exercise|theory|case_example|noise>", "payload": {...}, "reason": "<kurzer Grund>"}

Regeln:
- "reflection": eine Frage oder Selbstprüfung, die ein Coach einem Klienten stellen würde. payload = {title, question, follow_up}.
- "dialog_pattern": ein Coach-Klient-Dialogmuster. payload = {title, coach_line, client_response_pattern, next_move}.
- "exercise": eine strukturierte Übung mit Schritten. payload = {title, phases:[{name, instruction}, ...], duration_min}.
- "case_example": ein Fallbeispiel/Anekdote. payload = {title, summary, client_archetype}.
- "theory": Hintergrund/Konzept ohne direkten Klienten-Einsatz. KEIN payload.
- "noise": Inhaltsverzeichnis, Vorwort, Bibliographie, Marketing. KEIN payload.

Erzeuge KEINE Inhalte, die nicht im Chunk stehen. Paraphrasiere knapp, kein wörtliches Zitat über 280 Zeichen. Antworte ausschließlich mit dem JSON-Objekt, ohne Markdown-Fence.`;

export interface ClassifyOpts {
  client?: Anthropic;
  model?: string;
  maxTokens?: number;
}

export async function classifyChunk(chunkText: string, opts: ClassifyOpts = {}): Promise<ClassifierResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!opts.client && !apiKey) {
    throw new Error('ANTHROPIC_API_KEY missing — set it in environments/.secrets/<env>.yaml or pass an injected client');
  }
  const client = opts.client ?? new Anthropic({ apiKey });
  const model = opts.model ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 600;

  const userMsg = `Chunk:\n"""\n${chunkText.slice(0, 6000)}\n"""`;

  const tryOnce = async (extraSystem = ''): Promise<ClassifierResult> => {
    const resp = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT + extraSystem,
      messages: [{ role: 'user', content: userMsg }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('classifier returned no JSON object');
    const parsed = ClassifierEnvelope.parse(JSON.parse(jsonMatch[0]));
    if (parsed.kind === 'theory' || parsed.kind === 'noise') {
      return { kind: parsed.kind, payload: null, model, version: CLASSIFIER_VERSION, reason: parsed.reason };
    }
    const schema = PayloadByKind[parsed.kind];
    const payload = schema.parse(parsed.payload ?? {});
    return { kind: parsed.kind, payload: payload as Record<string, unknown>, model, version: CLASSIFIER_VERSION, reason: parsed.reason };
  };

  try {
    return await tryOnce();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return await tryOnce(`\n\nWICHTIG: Letzter Versuch schlug fehl wegen: ${msg.slice(0, 200)}. Liefere ein gültiges JSON-Objekt strikt nach Schema.`);
  }
}
