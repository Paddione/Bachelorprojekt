import type { SessionAgent, GenerateOptions, GenerateResult } from './session-agent';
import type { KiConfig } from './coaching-ki-config-db.ts';
import { searchCoachingKnowledgeTool } from './session-tools';
import { getProviderByName } from './provider-config';

// T001672: der `anthropic`-Provider hat in provider-config.ts `baseUrl: null`.
// environments/schema.yaml dokumentiert LLM_GATEWAY_URL als OpenAI-kompatiblen
// Gateway-Endpoint für genau diesen Provider — gelesen wurde die Variable aber
// nirgends, sie war also dokumentiert und wirkungslos (T002181).
// Präzedenz: explizite KI-Config > in der DB hinterlegte base_url > Env-Gateway.
function gatewayOverrideFor(provider: string): string | null {
  if (provider !== 'anthropic') return null;
  return process.env.LLM_GATEWAY_URL || null;
}

/**
 * Coaching-Inhalte duerfen nur an Provider gehen, die sich als on-premises
 * deklarieren [T002657].
 */
export class DataResidencyError extends Error {
  constructor(provider: string, residency: string) {
    super(
      `Coaching-Inhalte duerfen nur an on-premises-Provider gehen. `
      + `Provider '${provider}' ist als data_residency='${residency}' deklariert — `
      + `die Anfrage wurde NICHT gesendet.`,
    );
    this.name = 'DataResidencyError';
  }
}

/**
 * Zweiter Fluchtweg [T002657]. Der Guard oben stellt sicher, dass Coaching nur
 * an einen on-premises-Provider geht. Ist dieser Provider der llm-proxy, kann
 * der seinerseits ueber seine Prioritaetskette auf ein remote-Backend
 * ausweichen — die Konfiguration waere korrekt und die Inhalte trotzdem
 * draussen. Der Header verlangt vom Proxy, das zu unterlassen und lieber
 * fehlzuschlagen (scripts/llm-proxy/server.mjs).
 *
 * Unbeteiligte Endpunkte ignorieren einen unbekannten Header — er ist deshalb
 * unbedingt gesetzt und nicht an eine Endpunkt-Erkennung geknuepft. Eine
 * solche Erkennung waere eine zweite Stelle, die veralten koennte.
 */
const LOCAL_ONLY_HEADERS = { 'x-llm-local-only': '1' } as const;

async function resolveProvider(kiConfig: KiConfig) {
  const cfg = await getProviderByName(kiConfig.provider);

  // Der Guard steht hier und NICHT im Fehlerpfad des Aufrufs: resolveProvider
  // laeuft vor `new OpenAI(...)` und vor jedem `create`. Ein Guard, der erst
  // die Antwort bewertet, haette den Payload bereits uebertragen — bei
  // Coaching-Inhalten ist genau das der Schaden, der nicht mehr ruecknehmbar
  // ist. Kein Fallback auf einen anderen Provider: still auf ein anderes Ziel
  // auszuweichen wuerde dieselbe Frage nur verschieben.
  if (cfg.dataResidency !== 'on_premises') {
    throw new DataResidencyError(cfg.provider, cfg.dataResidency);
  }

  return {
    endpoint: kiConfig.apiEndpoint ?? cfg.baseUrl ?? gatewayOverrideFor(cfg.provider),
    apiKey: kiConfig.apiKey ?? cfg.apiKey,
    model: kiConfig.modelName ?? cfg.modelId,
  };
}

async function buildEnrichedSystemPrompt(
  basePrompt: string,
  userMessage: string,
): Promise<string> {
  const chunks = await searchCoachingKnowledgeTool(userMessage, 4);
  if (chunks.length === 0) return basePrompt;

  const knowledgeSection = chunks
    .map((c, i) => {
      const header = c.title ? `**[${i + 1}] ${c.title}**` : `**[${i + 1}]**`;
      return `${header}\n${c.body}\n*(${c.source})*`;
    })
    .join('\n\n');

  return `${basePrompt}\n\n## Coaching-Wissen (aus Wissensdatenbank)\n\n${knowledgeSection}`;
}

export class OpenAICompatibleSessionAgent implements SessionAgent {
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { kiConfig, history, effectiveSystemPrompt, assembledUserPrompt } = options;
    const startMs = Date.now();

    const { endpoint, apiKey, model } = await resolveProvider(kiConfig);
    const enrichedSystem = await buildEnrichedSystemPrompt(effectiveSystemPrompt, assembledUserPrompt);

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey, baseURL: endpoint ?? undefined, defaultHeaders: LOCAL_ONLY_HEADERS });

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: enrichedSystem },
      ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      { role: 'user', content: assembledUserPrompt },
    ];

    const resp = await client.chat.completions.create({
      model,
      max_tokens: kiConfig.maxTokens ?? 800,
      temperature: kiConfig.temperature ?? undefined,
      top_p: kiConfig.topP ?? undefined,
      messages,
    });

    const aiResponse = resp.choices[0]?.message.content ?? '';
    return { aiResponse, provider: kiConfig.provider, model, durationMs: Date.now() - startMs };
  }

  async *stream(options: GenerateOptions): AsyncIterable<string> {
    const { kiConfig, history, effectiveSystemPrompt, assembledUserPrompt } = options;

    const { endpoint, apiKey, model } = await resolveProvider(kiConfig);
    const enrichedSystem = await buildEnrichedSystemPrompt(effectiveSystemPrompt, assembledUserPrompt);

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey, baseURL: endpoint ?? undefined, defaultHeaders: LOCAL_ONLY_HEADERS });

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: enrichedSystem },
      ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      { role: 'user', content: assembledUserPrompt },
    ];

    const stream = await client.chat.completions.create({
      model,
      max_tokens: kiConfig.maxTokens ?? 800,
      temperature: kiConfig.temperature ?? undefined,
      top_p: kiConfig.topP ?? undefined,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  }
}
