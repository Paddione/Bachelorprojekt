import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const CLASSIFIER_VERSION = 'software-history-v1';
export const DEFAULT_MODEL = process.env.SOFTWARE_HISTORY_MODEL ?? 'claude-3-5-sonnet-20241022';

export const Event = z.object({
  service: z.string().min(1).max(64),
  area: z.enum([
    'chat','files','video','office','auth','ai','billing','admin',
    'tracking','board','arena','docs','internal','other',
  ]),
  kind: z.enum(['added','removed','changed','irrelevant']),
  confidence: z.number().min(0).max(1).default(0.8),
  notes: z.string().max(280).optional(),
});
export type Event = z.infer<typeof Event>;

export const Envelope = z.object({ events: z.array(Event).min(1) });

const SYSTEM_PROMPT = `Du klassifizierst einen GitHub-Pull-Request für eine Software-Stack-Historie.

Antworte AUSSCHLIESSLICH mit JSON in dieser Form (kein Markdown):
{"events": [{"service":"...","area":"...","kind":"...","confidence":0.0-1.0,"notes":"..."}]}

Regeln:
- Ein PR kann mehrere Events erzeugen (z.B. "Mattermost entfernt + Native-Chat ergänzt" = 2 Events).
- "service" ist klein-geschrieben, bindestrich-getrennt (z.B. "nextcloud-talk", "livekit", "mattermost", "operator-dashboard").
- "area" muss aus: chat, files, video, office, auth, ai, billing, admin, tracking, board, arena, docs, internal, other.
- "kind":
  - "added"      = neuer Service / neues Tool wird eingeführt
  - "removed"    = Service / Tool wird entfernt oder ersetzt
  - "changed"    = bestehender Service wird substanziell geändert (Update, Refactor, Migration)
  - "irrelevant" = PR betrifft keinen Stack-Bestandteil (Doku, kleinerer Bugfix, Plan-Archiv, Tracking-Drain)
- Wenn unsicher: ein einzelnes Event mit kind="irrelevant", service="unknown", area="other", niedrige confidence.
- "notes" optional, max 280 Zeichen, knappe deutsche Begründung.`;

export interface ClassifyPRInput {
  pr_number: number;
  title: string;
  description: string | null;
}

export interface ClassifyOpts {
  client?: Anthropic;
  model?: string;
}

export async function classifyPR(input: ClassifyPRInput, opts: ClassifyOpts = {}): Promise<Event[]> {
  const baseURL = process.env.LITELLM_URL ?? process.env.ANTHROPIC_BASE_URL;
  const apiKey  = process.env.ANTHROPIC_API_KEY ?? 'sk-local';
  const client  = opts.client ?? new Anthropic({ apiKey, baseURL });
  const model   = opts.model ?? DEFAULT_MODEL;

  const userMsg =
    `PR #${input.pr_number}\nTitel: ${input.title}\n\n` +
    `Body:\n"""\n${(input.description ?? '').slice(0, 6000)}\n"""`;

  const resp = await client.messages.create({
    model,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('classifier returned no JSON object');
  const parsed = Envelope.parse(JSON.parse(jsonMatch[0]));
  return parsed.events;
}
