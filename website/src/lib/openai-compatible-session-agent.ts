import type { SessionAgent, GenerateOptions, GenerateResult } from './session-agent';
import type { KiConfig } from './coaching-ki-config-db';
import { searchCoachingKnowledgeTool } from './session-tools';

export function resolveEndpoint(kiConfig: KiConfig): string {
  if (kiConfig.apiEndpoint) return kiConfig.apiEndpoint;
  const gpuBase = process.env.LLM_HOST_IP?.trim() || 'localhost';
  const defaults: Record<string, string> = {
    'deepseek': 'https://api.deepseek.com/v1',
    'anthropic': process.env.LLM_GATEWAY_URL ?? 'http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234/v1',
    'local-cluster': process.env.LLM_ROUTER_URL ?? `http://${gpuBase}:1234/v1`,
    'local-lmstudio': `http://${gpuBase}:1234/v1`,
    'local-ollama': `http://${gpuBase}:1234/v1`,
  };
  const url = defaults[kiConfig.provider];
  if (!url) throw new Error(`OpenAICompatibleSessionAgent: apiEndpoint fehlt für provider '${kiConfig.provider}'`);
  return url;
}

function resolveApiKey(kiConfig: KiConfig): string {
  if (kiConfig.apiKey) return kiConfig.apiKey;
  if (kiConfig.provider === 'deepseek') return process.env.DEEPSEEK_API_KEY ?? 'not-required';
  if (kiConfig.provider === 'anthropic') return process.env.ANTHROPIC_API_KEY ?? 'not-required';
  return 'not-required';
}

function resolveModel(kiConfig: KiConfig): string {
  if (kiConfig.modelName) return kiConfig.modelName;
  const defaults: Record<string, string> = {
    'deepseek': 'deepseek-chat',
    'local-lmstudio': 'qwen2.5-7b',
    'local-ollama': 'qwen2.5',
  };
  return defaults[kiConfig.provider] ?? 'llama3';
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

    const endpoint = resolveEndpoint(kiConfig);
    const enrichedSystem = await buildEnrichedSystemPrompt(effectiveSystemPrompt, assembledUserPrompt);

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: resolveApiKey(kiConfig), baseURL: endpoint });

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: enrichedSystem },
      ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      { role: 'user', content: assembledUserPrompt },
    ];

    const model = resolveModel(kiConfig);
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

    const endpoint = resolveEndpoint(kiConfig);
    const enrichedSystem = await buildEnrichedSystemPrompt(effectiveSystemPrompt, assembledUserPrompt);

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: resolveApiKey(kiConfig), baseURL: endpoint });

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: enrichedSystem },
      ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      { role: 'user', content: assembledUserPrompt },
    ];

    const stream = await client.chat.completions.create({
      model: resolveModel(kiConfig),
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
