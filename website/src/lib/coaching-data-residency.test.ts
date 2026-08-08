// coaching-data-residency.test.ts — T002657
//
// Coaching-Inhalte duerfen nur an Provider gehen, die sich als on-premises
// deklarieren. Gemessen am 2026-08-04 zeigten 13 der 18 coaching.sessions auf
// ki_config_id=82 (provider='deepseek', api.deepseek.com, Key gesetzt) — die
// erste echte Session waere dorthin gegangen, waehrend das Projekt
// "All data stays on-premises (DSGVO by design)" als Kernaussage fuehrt.
//
// Pruefmodus: Verhaltensverifikation. Die Tests RUFEN den Agenten auf und pruefen,
// ob ein Aufruf beim Provider ankam (mockCreate) — sie greppen keine Quelle.
// Der entscheidende Test ist "vor dem Netzaufruf": ein Guard im Fehlerpfad wuerde
// den Payload bereits gesendet haben und danach ablehnen.
//
// Erwartung vor der Implementierung: ROT. Weder gibt es dataResidency im
// Provider-Typ noch einen Guard, der darauf prueft.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
/** Konfigurationen, mit denen der OpenAI-Client tatsaechlich gebaut wurde. */
const clientConfigs: Array<Record<string, unknown>> = [];
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: (...a: unknown[]) => mockCreate(...a) } };
    constructor(cfg: Record<string, unknown>) { clientConfigs.push(cfg); }
  },
}));

vi.mock('./session-tools', () => ({
  searchCoachingKnowledgeTool: vi.fn().mockResolvedValue([]),
}));

const { getProviderByNameMock } = vi.hoisted(() => ({
  getProviderByNameMock: vi.fn(),
}));
vi.mock('./provider-config', () => ({
  getProviderByName: (...a: unknown[]) => getProviderByNameMock(...a),
}));

import type { KiConfig } from './coaching-ki-config-db.ts';
import { OpenAICompatibleSessionAgent } from './openai-compatible-session-agent';

const baseConfig = (overrides: Partial<KiConfig> = {}): KiConfig => ({
  id: 1,
  brand: 'mentolder',
  provider: 'deepseek',
  isActive: true,
  modelName: null,
  displayName: 'DeepSeek',
  createdAt: new Date(),
  apiEndpoint: null,
  apiKey: null,
  maxTokens: 100,
  temperature: null,
  topP: null,
  systemPrompt: null,
  notes: null,
  topK: null,
  thinkingMode: false,
  presencePenalty: null,
  frequencyPenalty: null,
  safePrompt: false,
  randomSeed: null,
  organizationId: null,
  euEndpoint: false,
  enabledFields: null,
  ...overrides,
});

const baseOptions = () => ({
  sessionId: 's-1',
  stepNumber: 1,
  coachInputs: {},
  kiConfig: baseConfig(),
  brand: 'mentolder',
  history: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
  effectiveSystemPrompt: 'system',
  assembledUserPrompt: 'hi',
  stepName: 'reflect',
});

describe('T002657: Datenresidenz-Guard im Coaching-Pfad', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    getProviderByNameMock.mockReset();
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
  });

  it('lehnt einen Provider mit data_residency=external ab und sendet nichts', async () => {
    getProviderByNameMock.mockResolvedValue({
      provider: 'deepseek',
      modelId: 'deepseek-v4-flash',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'k',
      dataResidency: 'external',
    });

    const agent = new OpenAICompatibleSessionAgent();
    await expect(agent.generate(baseOptions() as never)).rejects.toThrow(/residency|on_premises|extern/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('laesst einen Provider mit data_residency=on_premises durch', async () => {
    // Positiv-Anker: ohne ihn bestuende der Negativtest auch dann, wenn der Agent
    // grundsaetzlich nichts mehr sendet.
    getProviderByNameMock.mockResolvedValue({
      provider: 'local-cluster',
      modelId: 'gptoss-context',
      baseUrl: 'http://127.0.0.1:18235/v1',
      apiKey: '',
      dataResidency: 'on_premises',
    });

    const agent = new OpenAICompatibleSessionAgent();
    await agent.generate(baseOptions() as never);
    expect(mockCreate).toHaveBeenCalled();
  });

  it('behandelt eine fehlende Deklaration wie external', async () => {
    // Eine fehlende Aussage ist keine Zusage. Faellt dieser Fall auf "erlauben",
    // reicht ein vergessener Migrationseintrag fuer einen stillen Abfluss.
    getProviderByNameMock.mockResolvedValue({
      provider: 'deepseek',
      modelId: 'deepseek-v4-flash',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'k',
      // dataResidency fehlt bewusst
    });

    const agent = new OpenAICompatibleSessionAgent();
    await expect(agent.generate(baseOptions() as never)).rejects.toThrow(/residency|on_premises|extern/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('lehnt VOR dem Netzaufruf ab, nicht danach', async () => {
    // Der Kern des Vorgangs: ein Guard im Fehlerpfad haette den Payload bereits
    // gesendet. Der Provider antwortet hier mit einem Verbindungsfehler — kommt
    // dieser statt der Residenz-Ablehnung durch, stand der Guard zu spaet.
    getProviderByNameMock.mockResolvedValue({
      provider: 'deepseek',
      modelId: 'deepseek-v4-flash',
      baseUrl: 'https://unerreichbar.invalid/v1',
      apiKey: 'k',
      dataResidency: 'external',
    });
    mockCreate.mockRejectedValue(new Error('ECONNREFUSED verbindung fehlgeschlagen'));

    const agent = new OpenAICompatibleSessionAgent();
    await expect(agent.generate(baseOptions() as never)).rejects.toThrow(/residency|on_premises|extern/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // Zweiter Fluchtweg: der Guard oben laesst nur on-premises-Provider durch.
  // Ist dieser Provider der llm-proxy, kann der ueber seine Prioritaetskette
  // trotzdem auf ein remote-Backend ausweichen. Der Header verlangt, das zu
  // unterlassen. Ohne diesen Test faellt sein Fehlen still aus — die Anfrage
  // liefe weiterhin durch, nur eben moeglicherweise nach draussen.
  it('fordert vom Proxy lokal-only an, wenn der Provider durchgelassen wird', async () => {
    clientConfigs.length = 0;
    getProviderByNameMock.mockResolvedValue({
      provider: 'local-cluster',
      modelId: 'gpt-oss-20b',
      baseUrl: 'http://127.0.0.1:8081/v1',
      apiKey: 'not-required',
      dataResidency: 'on_premises',
    });

    const agent = new OpenAICompatibleSessionAgent();
    await agent.generate(baseOptions() as never);

    // Positiv-Anker: der Aufruf ist tatsaechlich gelaufen und hat einen Client
    // gebaut — sonst waere die Header-Aussage unten trivial erfuellt.
    expect(mockCreate).toHaveBeenCalled();
    expect(clientConfigs).toHaveLength(1);
    expect(clientConfigs[0].defaultHeaders).toMatchObject({ 'x-llm-local-only': '1' });
  });
});
