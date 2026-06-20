import OpenAI from 'openai';

export function makeLlmClient(baseURL: string) {
  const client = new OpenAI({ baseURL, apiKey: 'lm-studio' });
  return {
    async chatAnswer(systemPrompt: string, userPrompt: string, model = 'qwen2.5-7b-instruct'): Promise<string> {
      const r = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 800,
      });
      return r.choices[0]?.message?.content ?? '';
    },
    async translate(text: string, targetLang: string, model = 'qwen2.5-7b-instruct'): Promise<string> {
      const r = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: `Translate the following German text to ${targetLang}. Output only the translation, no commentary.` },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 600,
      });
      return r.choices[0]?.message?.content ?? '';
    },
  };
}

export type LlmClient = ReturnType<typeof makeLlmClient>;
