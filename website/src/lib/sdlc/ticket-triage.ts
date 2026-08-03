import Anthropic from '@anthropic-ai/sdk';
import { getProviderConfig, setProviderCooldown } from './provider-config';
import { SOURCE } from './ki-services';
import { getTicketDetail, addComment } from './tickets/admin';
import { pool } from './website-db';
import { logger } from './logger';

export interface TriageResult {
  priority: string;
  severity: string;
  component: string;
  reasoning: string;
}

const PRIORITY_MAP: Record<string, string> = {
  high: 'hoch', critical: 'hoch',
  medium: 'mittel',
  low: 'niedrig',
};

const VALID_SEVERITIES = ['critical', 'major', 'minor', 'trivial'];

export async function autoTriage(ticketId: string, brand: string): Promise<void> {
  try {
    await runTriage(ticketId, brand);
  } catch (err) {
    logger.error({ err }, '[ticket-triage] autoTriage failed');
  }
}

export async function runTriage(ticketId: string, brand: string): Promise<TriageResult | null> {
  const detail = await getTicketDetail(brand, ticketId);
  if (!detail) return null;

  const title = (detail.title ?? '').trim();
  const description = (detail.description ?? '').trim();
  if (!title && !description) return null;

  const cfg = await getProviderConfig(SOURCE.ticketTriage, 'haiku');
  if (!cfg.apiKey) return null;

  const client = new Anthropic({
    apiKey: cfg.apiKey,
    ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
  });

  const prompt = `Analysiere das folgende Support-Ticket und gib eine Einschaetzung zu Priority, Severity und Component zurueck.

Titel: ${title}
Beschreibung: ${description || '(keine Beschreibung)'}
Typ: ${detail.type}

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:
{"priority":"low|medium|high|critical","severity":"critical|major|minor|trivial","component":"<kurzer Component-Name>","reasoning":"<ein Satz Begruendung>"}

Regeln:
- priority: low (kosmetisch), medium (beeutraechtigend), high (blockierend), critical (Datenverlust)
- severity: critical (Systemausfall), major (Funktion kaputt), minor (Einschraenkung), trivial (kosmetisch)
- component: ein Wort oder Slash-Pfad, max 20 Zeichen, z.B. website/auth, brett, api, admin
- reasoning: max 120 Zeichen`;

  let parsed: { priority: string; severity: string; component: string; reasoning: string } | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await client.messages.create({
        model: cfg.modelId,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = msg.content.find(b => b.type === 'text')?.text?.trim() ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
        break;
      }
    } catch (err) {
      if (attempt === 1) {
        await setProviderCooldown(pool, SOURCE.ticketTriage, cfg.provider, 5);
        logger.error({ err }, '[ticket-triage] LLM call failed after retry');
        return null;
      }
    }
  }

  if (!parsed) return null;

  const priority = PRIORITY_MAP[parsed.priority] ?? 'mittel';
  const severity = VALID_SEVERITIES.includes(parsed.severity) ? parsed.severity : 'minor';
  const component = (parsed.component ?? '').slice(0, 50);
  const reasoning = (parsed.reasoning ?? '').slice(0, 200);

  const commentBody = [
    `**Auto-Triage Vorschlag**`,
    `- Priority: ${priority}`,
    `- Severity: ${severity}`,
    `- Component: ${component || '(nicht erkannt)'}`,
    reasoning ? `- Begruendung: ${reasoning}` : '',
  ].filter(Boolean).join('\n');

  await addComment({
    brand,
    ticketId,
    body: commentBody,
    visibility: 'internal',
    actor: { label: 'Auto-Triage' },
    kind: 'system',
  });

  return { priority, severity, component, reasoning };
}
