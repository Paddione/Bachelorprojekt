import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getPortfolio } from '../../../../lib/tickets/cockpit-db';
import { buildFeatureList, parseSuggestions, SUGGEST_SYSTEM_PROMPT } from '../../../../lib/tickets/suggest-prompt';
import OpenAI from 'openai';

export const SUGGEST_TIMEOUT_MS = 10_000;

interface ProviderSpec { id: string; baseURL: string; defaultModel: string; apiKeyEnv?: string }
const ALLOWED_PROVIDERS: Record<string, ProviderSpec> = {
  deepseek: { id: 'deepseek', baseURL: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', apiKeyEnv: 'DEEPSEEK_API_KEY' },
  anthropic: { id: 'anthropic', baseURL: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-20250514', apiKeyEnv: 'ANTHROPIC_API_KEY' },
};
function resolveProvider(id: string): ProviderSpec | null { return ALLOWED_PROVIDERS[id] ?? null; }

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const brand = process.env.BRAND_ID ?? process.env.BRAND ?? '';
  if (!brand) return json({ error: 'brand not configured' }, 500);

  let body: { provider?: string; model?: string };
  try { body = await request.json(); } catch { body = {}; }

  const providerSpec = resolveProvider(body.provider || 'deepseek');
  if (!providerSpec) return json({ error: `invalid provider: ${body.provider}` }, 400);

  const model = body.model || providerSpec.defaultModel;

  const apiKey = providerSpec.apiKeyEnv ? (process.env[providerSpec.apiKeyEnv] ?? '') : '';
  if (providerSpec.apiKeyEnv && !apiKey) {
    return json({ error: `provider not configured: ${providerSpec.id}` }, 503);
  }

  const portfolio = await getPortfolio(brand);
  const featureList = buildFeatureList(portfolio);

  if (featureList === '') return json({ suggestions: [] });

  try {
    const client = new OpenAI({ apiKey, baseURL: providerSpec.baseURL });

    const resp = await client.chat.completions.create({
      model,
      max_tokens: 2000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SUGGEST_SYSTEM_PROMPT },
        { role: 'user', content: `Hier sind die Features:\n\n${featureList}` },
      ],
    }, { timeout: SUGGEST_TIMEOUT_MS });

    const text = resp.choices[0]?.message.content ?? '';
    const suggestions = parseSuggestions(text);

    return json({ suggestions });
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes('timeout') || msg.includes('Timeout') || msg.includes('abort')) {
      return json({ error: 'AI provider timed out', raw: msg }, 504);
    }
    if (msg.includes('API key') || msg.includes('Incorrect API key'))
      return json({ error: 'AI API key not configured', raw: msg }, 500);
    return json({ error: msg }, 500);
  }
};
