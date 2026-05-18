import type { SessionAgent, GenerateOptions, GenerateResult } from './session-agent';

export class LegacySessionAgent implements SessionAgent {
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { kiConfig, history, effectiveSystemPrompt, assembledUserPrompt } = options;
    const provider = kiConfig.provider;
    const startMs = Date.now();
    let aiResponse: string;
    const model = kiConfig.modelName ?? (provider === 'openai' ? 'gpt-4o-mini' : 'mistral-small-latest');

    if (provider === 'openai') {
      const apiKey = kiConfig.apiKey ?? process.env.OPENAI_API_KEY;
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
      const apiKey = kiConfig.apiKey ?? process.env.MISTRAL_API_KEY;
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

    } else {
      throw new Error(`LegacySessionAgent: unsupported provider '${provider}'`);
    }

    return { aiResponse, provider, model, durationMs: Date.now() - startMs };
  }
}
