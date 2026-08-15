import type { SessionAgent, GenerateOptions, GenerateResult } from './session-agent';
import { getProviderByName } from './provider-config';

export class LegacySessionAgent implements SessionAgent {
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { kiConfig, history, effectiveSystemPrompt, assembledUserPrompt } = options;
    const provider = kiConfig.provider;
    const startMs = Date.now();
    let aiResponse: string;

    const cfg = await getProviderByName(provider);
    const model = kiConfig.modelName ?? cfg.modelId;

    if (provider === 'openai') {
      const apiKey = kiConfig.apiKey ?? cfg.apiKey;
      if (!apiKey) throw new Error('OPENAI_API_KEY nicht konfiguriert');
      const { default: OpenAI } = await import('openai');
      const clientOpts: ConstructorParameters<typeof OpenAI>[0] = { apiKey };
      if (kiConfig.apiEndpoint) clientOpts.baseURL = kiConfig.apiEndpoint;
      if (kiConfig.organizationId) clientOpts.organization = kiConfig.organizationId;
      const client = new OpenAI(clientOpts);
      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: effectiveSystemPrompt },
        ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        { role: 'user', content: assembledUserPrompt },
      ];
      const resp = await client.chat.completions.create({
        model,
        max_tokens: kiConfig.maxTokens ?? 600,
        temperature: kiConfig.temperature ?? undefined,
        top_p: kiConfig.topP ?? undefined,
        presence_penalty: kiConfig.presencePenalty ?? undefined,
        frequency_penalty: kiConfig.frequencyPenalty ?? undefined,
        messages,
      });
      aiResponse = resp.choices[0]?.message.content ?? '';

    } else if (provider === 'mistral') {
      const apiKey = kiConfig.apiKey ?? cfg.apiKey;
      if (!apiKey) throw new Error('MISTRAL_API_KEY nicht konfiguriert');
      const { Mistral } = await import('@mistralai/mistralai');
      const clientOpts: ConstructorParameters<typeof Mistral>[0] = { apiKey };
      if (kiConfig.apiEndpoint) clientOpts.serverURL = kiConfig.apiEndpoint;
      const client = new Mistral(clientOpts);
      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: effectiveSystemPrompt },
        ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        { role: 'user', content: assembledUserPrompt },
      ];
      const resp = await client.chat.complete({
        model,
        maxTokens: kiConfig.maxTokens ?? undefined,
        temperature: kiConfig.temperature ?? undefined,
        topP: kiConfig.topP ?? undefined,
        randomSeed: kiConfig.randomSeed ?? undefined,
        safePrompt: kiConfig.safePrompt ?? false,
        messages,
      });
      aiResponse = (resp.choices?.[0]?.message?.content as string) ?? '';

    } else if (provider === 'claude' || provider === 'lumo' || provider.startsWith('custom_')) {
      // OpenAI-compatible path: used for local llm-router (claude), Lumo, and custom endpoints.
      // apiEndpoint in the config must point to an OpenAI-compatible /v1 base URL.
      const apiKey = kiConfig.apiKey ?? cfg.apiKey;
      const endpoint = kiConfig.apiEndpoint;
      if (!endpoint) throw new Error(`Provider '${provider}': apiEndpoint muss gesetzt sein`);
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey, baseURL: endpoint });
      const resolvedModel = model;
      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: effectiveSystemPrompt },
        ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        { role: 'user', content: assembledUserPrompt },
      ];
      const resp = await client.chat.completions.create({
        model: resolvedModel,
        max_tokens: kiConfig.maxTokens ?? 600,
        temperature: kiConfig.temperature ?? undefined,
        top_p: kiConfig.topP ?? undefined,
        messages,
      });
      aiResponse = resp.choices[0]?.message.content ?? '';

    } else {
      throw new Error(`LegacySessionAgent: unsupported provider '${provider}'`);
    }

    return { aiResponse, provider, model, durationMs: Date.now() - startMs };
  }
}
