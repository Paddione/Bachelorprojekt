import { describe, it, expect } from 'vitest';
import { KI_CATALOG, interfaceById, modelsFor } from './ki-catalog';

describe('KI_CATALOG (kuratierte angebotene Schnittstellen)', () => {
  it('enthält die angebotenen Provider', () => {
    const ids = KI_CATALOG.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'anthropic', 'deepseek', 'local-cluster', 'local-lmstudio', 'local-ollama',
        'openai', 'mistral', 'voyage', 'custom',
      ]),
    );
  });

  it('hat KEINEN alten local-llm-Eintrag mehr (umbenannt zu local-cluster)', () => {
    expect(interfaceById('local-llm')).toBeUndefined();
    expect(interfaceById('local-cluster')).toBeDefined();
  });

  it('GPU-Worker-Provider zeigen auf localhost und brauchen keinen API-Key', () => {
    const lm = interfaceById('local-lmstudio')!;
    const ol = interfaceById('local-ollama')!;
    expect(lm.defaultBaseUrl).toBe('http://localhost:1234/v1');
    expect(ol.defaultBaseUrl).toBe('http://localhost:11434/v1');
    expect(lm.apiKeyEnv).toBeUndefined();
    expect(ol.apiKeyEnv).toBeUndefined();
    expect(lm.perRowApiKey).toBeFalsy();
    expect(ol.perRowApiKey).toBeFalsy();
    expect(lm.kinds).toContain('chat');
    expect(ol.kinds).toContain('chat');
  });

  it('hat eindeutige ids und nicht-leere kinds', () => {
    expect(new Set(KI_CATALOG.map((i) => i.id)).size).toBe(KI_CATALOG.length);
    for (const i of KI_CATALOG) {
      expect(i.kinds.length).toBeGreaterThan(0);
      expect(i.label.length).toBeGreaterThan(0);
    }
  });

  it('enthält KEINE Brand-Domain-Literale (S3)', () => {
    const blob = JSON.stringify(KI_CATALOG).toLowerCase();
    expect(blob).not.toContain('mentolder');
    expect(blob).not.toContain('korczewski');
  });

  it('genau ein custom-Eintrag mit Freitext-Override', () => {
    const customs = KI_CATALOG.filter((i) => i.custom);
    expect(customs).toHaveLength(1);
    expect(customs[0].id).toBe('custom');
  });

  it('chat-Provider haben suggestedModels (außer custom/lumo)', () => {
    const anthropic = interfaceById('anthropic')!;
    expect(anthropic.kinds).toContain('chat');
    expect(anthropic.suggestedModels.length).toBeGreaterThan(0);
  });

  it('voyage bedient embed + rerank', () => {
    expect(interfaceById('voyage')!.kinds).toEqual(expect.arrayContaining(['embed', 'rerank']));
  });
});

describe('Katalog-Helfer', () => {
  it('interfaceById findet bzw. gibt undefined', () => {
    expect(interfaceById('deepseek')!.label.length).toBeGreaterThan(0);
    expect(interfaceById('does-not-exist')).toBeUndefined();
  });

  it('modelsFor gibt die Modelle des Providers', () => {
    expect(modelsFor('anthropic').map((m) => m.id)).toContain('claude-sonnet-4-6');
    expect(modelsFor('nope')).toEqual([]);
  });
});

describe('local-qwen35 + neue Cloud-Provider (T001590)', () => {
  it('registers local-qwen35 (no key) and the four new cloud providers', () => {
    const local = interfaceById('local-qwen35');
    expect(local?.defaultBaseUrl).toBe('http://100.102.71.114:1234/v1');
    expect(local?.apiKeyEnv).toBeUndefined();
    expect(interfaceById('openrouter')?.apiKeyEnv).toBe('OPENROUTER_API_KEY');
    expect(interfaceById('opencode-zen')?.apiKeyEnv).toBe('OPENCODE_API_KEY');
    expect(interfaceById('google-gemini')?.apiKeyEnv).toBe('GEMINI_API_KEY');
    expect(interfaceById('github-models')?.apiKeyEnv).toBe('GITHUB_MODELS_TOKEN');
  });
});
