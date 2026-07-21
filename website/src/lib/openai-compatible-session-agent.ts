import type { SessionAgent, GenerateOptions, GenerateResult } from './session-agent';
import type { KiConfig } from './coaching-ki-config-db';
import { searchCoachingKnowledgeTool } from './session-tools';
import { getProviderByName } from './provider-config';

async function resolveProvider(kiConfig: KiConfig) {
  const cfg = await getProviderByName(kiConfig.provider);
  return {
    endpoint: kiConfig.apiEndpoint ?? cfg.baseUrl,
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
    const client = new OpenAI({ apiKey, baseURL: endpoint ?? undefined });

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
    const client = new OpenAI({ apiKey, baseURL: endpoint ?? undefined });

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
