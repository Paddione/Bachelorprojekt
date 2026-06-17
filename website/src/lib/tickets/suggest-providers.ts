export interface ProviderSpec {
  id: string;
  baseURL: string;
  defaultModel: string;
  apiKeyEnv?: string;
}

export const ALLOWED_PROVIDERS: Record<string, ProviderSpec> = {
  deepseek: {
    id: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
  anthropic: {
    id: 'anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  'local-cluster': {
    id: 'local-cluster',
    baseURL: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5',
  },
};

export function resolveProvider(id: string): ProviderSpec | null {
  return ALLOWED_PROVIDERS[id] ?? null;
}
