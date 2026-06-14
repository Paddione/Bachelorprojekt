import { describe, it, expect } from 'vitest';
import { KI_CATALOG, interfaceById, modelsFor } from './ki-catalog';

describe('KI_CATALOG (kuratierte angebotene Schnittstellen)', () => {
  it('enthält die angebotenen Provider', () => {
    const ids = KI_CATALOG.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining(['anthropic', 'deepseek', 'local-llm', 'openai', 'mistral', 'voyage', 'custom']),
    );
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
