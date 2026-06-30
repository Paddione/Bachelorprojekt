// website/src/pages/api/admin/tickets/[id]/classify.ts
import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getTicketDetail, patchAdminTicket } from '../../../../../lib/tickets/admin';
import { getProviderConfig, setProviderCooldown } from '../../../../../lib/provider-config';
import { SOURCE } from '../../../../../lib/ki-services';
import { pool } from '../../../../../lib/website-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

const PRIORITY_MAP: Record<string, 'hoch' | 'mittel' | 'niedrig'> = {
  high: 'hoch', critical: 'hoch',
  medium: 'mittel',
  low: 'niedrig',
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  const detail = await getTicketDetail(BRAND(), id);
  if (!detail) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });

  const cfg = await getProviderConfig(SOURCE.ticketTriage, 'haiku');
  if (!cfg.apiKey) {
    return new Response(JSON.stringify({ error: 'KI-Provider nicht konfiguriert' }), { status: 503 });
  }

  const prompt = `Classify this support ticket and respond with ONLY valid JSON, no other text.

Title: ${detail.title}
Description: ${detail.description ?? '(keine Beschreibung)'}

Respond exactly:
{"component":"<short component name, e.g. website/auth/brett/api>","priority":"low|medium|high|critical","attention_mode":"ai_ready|needs_human"}

Rules:
- component: one lowercase word or slash-path, max 20 chars
- priority: low if minor cosmetic, medium if impactful, high if blocking, critical if data loss
- attention_mode: ai_ready if description is clear and actionable, needs_human if ambiguous`;

  let parsed: { component: string; priority: string; attention_mode: string } | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const client = new Anthropic({
        apiKey: cfg.apiKey,
        ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
      });
      const msg = await client.messages.create({
        model: cfg.modelId,
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = msg.content.find(b => b.type === 'text')?.text?.trim() ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
        break;
      }
    } catch {
      if (attempt === 1) {
        await setProviderCooldown(pool, SOURCE.ticketTriage, cfg.provider, 5);
        return new Response(JSON.stringify({ error: 'LLM nicht erreichbar' }), { status: 503 });
      }
    }
  }

  if (!parsed) {
    return new Response(JSON.stringify({ error: 'KI-Antwort konnte nicht geparst werden' }), { status: 500 });
  }

  const mappedPriority = PRIORITY_MAP[parsed.priority] ?? 'mittel';
  const mappedAttention = ['ai_ready', 'needs_human'].includes(parsed.attention_mode)
    ? parsed.attention_mode as 'ai_ready' | 'needs_human'
    : 'ai_ready';

  await patchAdminTicket({
    brand: BRAND(),
    id,
    component: parsed.component.slice(0, 50) || null,
    priority: mappedPriority,
    attentionMode: mappedAttention,
    actor: { label: session.preferred_username },
  });

  return new Response(JSON.stringify({
    ticket_id: id,
    component: parsed.component,
    priority: mappedPriority,
    attention_mode: mappedAttention,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
