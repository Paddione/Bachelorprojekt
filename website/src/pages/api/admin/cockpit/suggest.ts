import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getPortfolio } from '../../../../lib/tickets/cockpit-db';

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
  const features = portfolio.products.flatMap(p => p.features);

  if (features.length === 0) return json({ suggestions: [] });

  const featureList = features.map((f, i) =>
    `${i + 1}. [${f.extId}] ${f.title} (Produkt: ${portfolio.products.find(p =>
      p.features.some(pf => pf.id === f.id))?.title ?? '?'}, ` +
    `Priorität: ${f.priority}, Major: ${f.majorFeature}, Verworfen: ${f.discarded}, ` +
    `Nächster Schritt: ${f.nextStep}` +
    `${f.suggestionComment ? `, Kommentar: ${f.suggestionComment}` : ''})`,
  ).join('\n');

  const systemPrompt = `Du bist ein Feature-Portfolio-Manager. Verteile die folgenden Features auf "nächster Schritt" (nextStep).
Regeln:
1. Gleichverteilung über Produkte: ungefähr gleiche Anzahl Features pro Produkt für nextStep=true.
2. Features mit discarded=true nicht für nextStep vorschlagen.
3. Features mit majorFeature=true bevorzugen.
4. Falls ein Kommentar vorhanden ist, diesen als Kontext berücksichtigen.
5. Antworte NUR mit einem JSON-Array, kein weiterer Text: [{"featureId":"<extId>","nextStep":true|false,"reason":"<kurze Begründung>"}]`;

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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Hier sind die Features:\n\n${featureList}` },
      ],
    });

    const text = resp.choices[0]?.message.content ?? '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return json({ error: 'AI response could not be parsed', raw: text }, 500);

    const suggestions = JSON.parse(match[0]);
    return json({ suggestions });
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes('API key') || msg.includes('Incorrect API key'))
      return json({ error: 'Deepseek API key not configured', raw: msg }, 500);
    return json({ error: msg }, 500);
  }
};
