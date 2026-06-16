import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getPortfolio } from '../../../../lib/tickets/cockpit-db';
import { buildFeatureList, parseSuggestions, SUGGEST_SYSTEM_PROMPT } from '../../../../lib/tickets/suggest-prompt';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  let body: { provider?: string; model?: string };
  try { body = await request.json(); } catch { body = {}; }

  const provider = body.provider || 'deepseek';
  const model = body.model || 'deepseek-chat';

  const portfolio = await getPortfolio(BRAND());
  const featureList = buildFeatureList(portfolio);

  if (featureList === '') return json({ suggestions: [] });

  try {
    const { default: OpenAI } = await import('openai');
    const endpoint = provider === 'deepseek' ? 'https://api.deepseek.com/v1' : undefined;
    const apiKey = provider === 'deepseek' ? (process.env.DEEPSEEK_API_KEY ?? 'not-required') : 'not-required';
    const client = new OpenAI({ apiKey, baseURL: endpoint });

    const resp = await client.chat.completions.create({
      model,
      max_tokens: 2000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SUGGEST_SYSTEM_PROMPT },
        { role: 'user', content: `Hier sind die Features:\n\n${featureList}` },
      ],
    });

    const text = resp.choices[0]?.message.content ?? '';
    const suggestions = parseSuggestions(text);
    if (suggestions.length === 0) return json({ error: 'AI response could not be parsed', raw: text }, 500);

    return json({ suggestions });
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes('API key') || msg.includes('Incorrect API key'))
      return json({ error: 'Deepseek API key not configured', raw: msg }, 500);
    return json({ error: msg }, 500);
  }
};
