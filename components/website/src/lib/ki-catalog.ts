// Kuratierter Katalog der angebotenen KI-API-Schnittstellen.
//
// Das ist die "Liste, aus der man wählt": jeder Eintrag ist eine Schnittstelle, die wir
// anbieten. Im Dashboard werden Provider + Modell als Dropdown hieraus gerendert; nur der
// `custom`-Eintrag erlaubt Freitext-Override. Pure module: nur Daten + Helfer, keine Imports
// (S2 — keine Zyklen), keine Brand-Domain-Literale (S3).

export type InterfaceKind = 'chat' | 'embed' | 'rerank';

export type ParamKey =
  | 'temperature' | 'maxTokens' | 'topP' | 'topK' | 'systemPrompt'
  | 'presencePenalty' | 'frequencyPenalty' | 'safePrompt' | 'randomSeed'
  | 'organizationId' | 'euEndpoint' | 'thinkingMode';

export interface CatalogModel {
  id: string;
  label: string;
  tier?: 'sonnet' | 'haiku';
}

export interface InterfaceDef {
  /** Provider-Id, gespeichert in provider_config.provider. */
  id: string;
  label: string;
  /** Welche Aufgaben die Schnittstelle bedient. */
  kinds: InterfaceKind[];
  /** Vorgeschlagene Modelle (Dropdown). */
  suggestedModels: CatalogModel[];
  /** Standard-Endpoint (vorbelegt, überschreibbar). */
  defaultBaseUrl?: string;
  /** ENV-Variable für den API-Key globaler Routing-Rows. */
  apiKeyEnv?: string;
  /** true → Coaching speichert den Key pro Zeile (nicht aus ENV). */
  perRowApiKey?: boolean;
  /** Welche Coaching-Parameter-Felder relevant sind. */
  supportsParams?: ParamKey[];
  /** true → Freitext-Override für provider/model/endpoint erlaubt. */
  custom?: boolean;
}

const COMMON_PARAMS: ParamKey[] = ['temperature', 'maxTokens', 'topP', 'systemPrompt'];

export const KI_CATALOG: InterfaceDef[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    kinds: ['chat'],
    suggestedModels: [
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: 'sonnet' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'haiku' },
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    ],
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    perRowApiKey: true,
    supportsParams: [...COMMON_PARAMS, 'thinkingMode'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kinds: ['chat'],
    suggestedModels: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat', tier: 'sonnet' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', tier: 'sonnet' },
    ],
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    perRowApiKey: true,
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'local-cluster',
    label: 'Lokales LLM — Cluster (llm-router)',
    kinds: ['chat'],
    suggestedModels: [
      { id: 'qwen2.5', label: 'Qwen 2.5' },
      { id: 'llama3.1', label: 'Llama 3.1' },
    ],
    defaultBaseUrl: 'http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234/v1',
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'local-lmstudio',
    label: 'LM Studio (GPU-Worker localhost:1234)',
    kinds: ['chat'],
    suggestedModels: [
      { id: 'qwen2.5-7b', label: 'Qwen 2.5 7B' },
      { id: 'deepseek-r1-7b', label: 'DeepSeek R1 7B' },
      { id: 'llama-3.1-8b', label: 'Llama 3.1 8B' },
      { id: 'mistral-7b', label: 'Mistral 7B' },
    ],
    defaultBaseUrl: 'http://localhost:1234/v1',
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'local-ollama',
    label: 'Ollama (GPU-Worker localhost:11434)',
    kinds: ['chat'],
    suggestedModels: [
      { id: 'qwen2.5', label: 'Qwen 2.5' },
      { id: 'llama3.1', label: 'Llama 3.1' },
      { id: 'mistral', label: 'Mistral' },
      { id: 'deepseek-r1', label: 'DeepSeek R1' },
    ],
    defaultBaseUrl: 'http://localhost:11434/v1',
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kinds: ['chat'],
    suggestedModels: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    ],
    apiKeyEnv: 'OPENAI_API_KEY',
    perRowApiKey: true,
    supportsParams: [...COMMON_PARAMS, 'presencePenalty', 'frequencyPenalty', 'randomSeed', 'organizationId'],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    kinds: ['chat'],
    suggestedModels: [
      { id: 'mistral-large-latest', label: 'Mistral Large' },
      { id: 'mistral-small-latest', label: 'Mistral Small' },
    ],
    perRowApiKey: true,
    supportsParams: [...COMMON_PARAMS, 'safePrompt', 'randomSeed', 'euEndpoint'],
  },
  {
    id: 'lumo',
    label: 'Lumo (Proton)',
    kinds: ['chat'],
    suggestedModels: [],
    perRowApiKey: true,
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'voyage',
    label: 'Voyage',
    kinds: ['embed', 'rerank'],
    suggestedModels: [
      { id: 'voyage-multilingual-2', label: 'voyage-multilingual-2' },
    ],
    apiKeyEnv: 'VOYAGE_API_KEY',
  },
  {
    id: 'local-qwen35',
    label: 'Lokales qwen3.5 (LM Studio, Mesh)',
    kinds: ['chat'],
    suggestedModels: [{ id: 'qwen3.5-9b@iq4_xs', label: 'Qwen 3.5 9B (iq4_xs)' }],
    defaultBaseUrl: 'http://100.102.71.114:1234/v1',
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kinds: ['chat'],
    suggestedModels: [],
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    perRowApiKey: true,
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'opencode-zen',
    label: 'opencode Zen',
    kinds: ['chat'],
    suggestedModels: [],
    apiKeyEnv: 'OPENCODE_API_KEY',
    perRowApiKey: true,
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'google-gemini',
    label: 'Google Gemini',
    kinds: ['chat'],
    suggestedModels: [],
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnv: 'GEMINI_API_KEY',
    perRowApiKey: true,
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'github-models',
    label: 'GitHub Models',
    kinds: ['chat'],
    suggestedModels: [],
    defaultBaseUrl: 'https://models.github.ai/inference',
    apiKeyEnv: 'GITHUB_MODELS_TOKEN',
    perRowApiKey: true,
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'custom',
    label: 'Custom (eigener Endpoint)',
    kinds: ['chat'],
    suggestedModels: [],
    perRowApiKey: true,
    custom: true,
    supportsParams: [...COMMON_PARAMS, 'topK', 'presencePenalty', 'frequencyPenalty', 'safePrompt', 'randomSeed', 'organizationId', 'euEndpoint', 'thinkingMode'],
  },
];

export function interfaceById(id: string): InterfaceDef | undefined {
  return KI_CATALOG.find((i) => i.id === id);
}

export function modelsFor(id: string): CatalogModel[] {
  return interfaceById(id)?.suggestedModels ?? [];
}
