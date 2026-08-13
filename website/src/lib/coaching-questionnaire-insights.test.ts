// coaching-questionnaire-insights.test.ts — T002652
//
// Fragebogen-Insights: Embedding aller Antworten (bge-m3, fail-closed), DBSCAN-
// Clusterung (reine TS-Logik) und LLM-Labels ueber den DSGVO-geguardeten
// Session-Agent-Pfad.
//
// Pruefmodus: Verhaltensverifikation mit synthetischen Fixtures. Die Prod-Daten
// enthalten 16430 Antworten, deren details_text generierter Schablonentext ist
// (69/71 Zeichen) — die Qualitaet der semantischen Clusterung ist damit erst mit
// echten Daten beurteilbar (Vorbehalt im Lib-Kommentar). Es gibt deshalb KEINE
// Live-DB-Assertions; cluster() arbeitet auf 2D/n-dim synthetischen Vektoren.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import type { KiConfig } from './coaching-ki-config-db.ts';

vi.mock('./embeddings', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./embeddings')>();
  return { ...mod, embedBatch: vi.fn() };
});

vi.mock('./session-agent-factory', () => ({
  createSessionAgent: vi.fn(),
}));

vi.mock('./coaching-ki-config-db', () => ({
  getActiveProvider: vi.fn().mockResolvedValue(null),
  getKiProviderById: vi.fn().mockResolvedValue(null),
}));

const { createSessionAgent } = await import('./session-agent-factory');
const { embedBatch } = await import('./embeddings');
const { cluster, embed, label, generateQuestionnaireInsights } = await import('./coaching-questionnaire-insights');

const mockEmbedBatch = vi.mocked(embedBatch);
const mockCreateSessionAgent = vi.mocked(createSessionAgent);

/** d-dim Einheitsvektoren mit sehr geringem Winkel zur Gruppe. */
function unit(angleDeg: number): number[] {
  const rad = (angleDeg * Math.PI) / 180;
  return [Math.cos(rad), Math.sin(rad)];
}

const baseConfig = (overrides: Partial<KiConfig> = {}): KiConfig => ({
  id: 1, brand: 'mentolder', provider: 'local-cluster', isActive: true,
  modelName: null, displayName: 'Lokal', createdAt: new Date(),
  apiEndpoint: null, apiKey: null, maxTokens: 200, temperature: null,
  topP: null, systemPrompt: null, notes: null, topK: null,
  thinkingMode: false, presencePenalty: null, frequencyPenalty: null,
  safePrompt: false, randomSeed: null, organizationId: null,
  euEndpoint: false, enabledFields: null,
  ...overrides,
});

describe('cluster (DBSCAN, cosine distance)', () => {
  beforeEach(() => { mockEmbedBatch.mockReset(); mockCreateSessionAgent.mockReset(); });

  it('gruppiert kohaerente Vektoren in je einen Cluster', () => {
    // Drei Gruppen: Winkel -10..+10, 80..100, 170..190 — intra weit unter 0.2.
    const answers = [
      ...[-10, 0, 10].map(a => ({ id: `a${a}`, text: 't', vector: unit(a) })),
      ...[80, 90, 100].map(a => ({ id: `b${a}`, text: 't', vector: unit(a) })),
      ...[170, 180, 190].map(a => ({ id: `c${a}`, text: 't', vector: unit(a) })),
    ];
    const clusters = cluster(answers, { eps: 0.2, minPts: 3 });
    expect(clusters).toHaveLength(3);
    for (const c of clusters) expect(c.memberIds).toHaveLength(3);
  });

  it('zerfaellt bei zu kleinem eps in Rauschen — mit Positiv-Anker bei normalem eps', () => {
    const answers = [0, 2, 4, 6, 8].map(a => ({ id: `a${a}`, text: 't', vector: unit(a) }));
    // Positiv-Anker: mit eps oberhalb des Paarabstands (1-cos(2°)≈0.0006)
    // verbindet die Kette alle Punkte zu einem Cluster.
    const wide = cluster(answers, { eps: 0.002, minPts: 2 });
    expect(wide).toHaveLength(1);
    expect(wide[0].memberIds).toHaveLength(5);
    // Bei eps unter dem Abstand des naechsten Paares zerfaellt alles in Rauschen.
    const narrow = cluster(answers, { eps: 0.0001, minPts: 2 });
    expect(narrow).toHaveLength(0);
  });

  it('behandelt eine zu dichte Gruppe bei hohem minPts als Rauschen', () => {
    const answers = [-1, 0, 1].map(a => ({ id: `a${a}`, text: 't', vector: unit(a) }));
    const clusters = cluster(answers, { eps: 0.2, minPts: 4 });
    expect(clusters).toHaveLength(0);
  });

  it('verschmilzt benachbarte Gruppen bei grossem eps', () => {
    const answers = [0, 5, 10].map(a => ({ id: `a${a}`, text: 't', vector: unit(a) }));
    const clusters = cluster(answers, { eps: 0.5, minPts: 2 });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberIds).toHaveLength(3);
  });
});

describe('embed', () => {
  beforeEach(() => { mockEmbedBatch.mockReset(); mockCreateSessionAgent.mockReset(); });

  it('ueberspringt leere details_text und liefert id->Vektor-Paare', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { id: '1', details_text: 'Ich moechte mehr Klarheit.' },
          { id: '2', details_text: '   ' },
          { id: '3', details_text: '' },
        ],
      }),
    } as unknown as Pool;
    mockEmbedBatch.mockResolvedValue({ embeddings: [[0.1, 0.2]], tokens: 1 });

    const out = await embed(pool);
    expect(mockEmbedBatch).toHaveBeenCalledTimes(1);
    expect(mockEmbedBatch.mock.calls[0][0]).toEqual(['Ich moechte mehr Klarheit.']);
    expect(out).toEqual([
      { id: '1', text: 'Ich moechte mehr Klarheit.', vector: [0.1, 0.2] },
    ]);
  });

  it('laesst EmbeddingIndexError fail-closed durchschlagen (kein Degradieren)', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: '1', details_text: 'x' }] }),
    } as unknown as Pool;
    const { EmbeddingIndexError } = await import('./embeddings');
    mockEmbedBatch.mockRejectedValue(new EmbeddingIndexError('router 503'));

    await expect(embed(pool)).rejects.toThrow(EmbeddingIndexError);
  });
});

describe('label', () => {
  beforeEach(() => { mockEmbedBatch.mockReset(); mockCreateSessionAgent.mockReset(); });

  it('liefert labels=null, wenn kein LLM verfuegbar ist — Cluster bleiben erhalten', async () => {
    const answers = [
      { id: 'a1', text: 'Antwort 1', vector: unit(0) },
      { id: 'a2', text: 'Antwort 2', vector: unit(5) },
    ];
    const clusters = cluster(answers, { eps: 0.2, minPts: 2 });
    expect(clusters).toHaveLength(1);

    const labels = await label(answers, clusters, { kiConfig: null });
    expect(labels).toEqual([null]);
    expect(mockCreateSessionAgent).not.toHaveBeenCalled();
  });

  it('ruft pro Cluster genau einen Agenten-Generate auf und liefert Labels', async () => {
    const answers = [
      ...[-10, 0, 10].map(a => ({ id: `a${a}`, text: 't', vector: unit(a) })),
      ...[80, 90, 100].map(a => ({ id: `b${a}`, text: 't', vector: unit(a) })),
    ];
    const clusters = cluster(answers, { eps: 0.2, minPts: 3 });
    expect(clusters).toHaveLength(2);

    const generate = vi.fn()
      .mockResolvedValueOnce({ aiResponse: 'Orientierung', provider: 'local-cluster', model: 'm', durationMs: 1 })
      .mockResolvedValueOnce({ aiResponse: 'Selbstwert', provider: 'local-cluster', model: 'm', durationMs: 1 });
    mockCreateSessionAgent.mockReturnValue({ generate } as never);

    const labels = await label(answers, clusters, { kiConfig: baseConfig() });
    expect(labels).toEqual(['Orientierung', 'Selbstwert']);
    expect(mockCreateSessionAgent).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(2);
    // DSGVO: der Prompt enthaelt nur reprasentative Antworten, nicht alle.
    const prompts = generate.mock.calls.map(c => c[0].assembledUserPrompt as string);
    for (const p of prompts) expect(p.length).toBeGreaterThan(0);
  });
});

describe('generateQuestionnaireInsights', () => {
  beforeEach(() => { mockEmbedBatch.mockReset(); mockCreateSessionAgent.mockReset(); });

  it('antwortet mit Cluster-Struktur, embeddingModel bge-m3 und cached=false', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: '1', details_text: 'Thema Burnout' }] }) // cache check (leer)
        .mockResolvedValueOnce({ rows: [{ id: '1', details_text: 'Thema Burnout' }] }) // answers
        .mockResolvedValueOnce({ rows: [] }), // cache insert
    } as unknown as Pool;
    mockEmbedBatch.mockResolvedValue({ embeddings: [[0.9, 0.1]], tokens: 1 });

    const result = await generateQuestionnaireInsights(pool, { brand: 'mentolder' });
    expect(result.embeddingModel).toBe('bge-m3');
    expect(result.cached).toBe(false);
    expect(result.clusters).toHaveLength(0); // 1 Punkt + minPts 3 -> Rauschen
    expect(result.generatedAt).toBeTruthy();
  });

  it('nutzt einen frischen Cache-Treffer (< 24h) und meldet cached=true', async () => {
    const pool = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [{ payload: { embeddingModel: 'bge-m3', cached: true, clusters: [] } }],
      }),
    } as unknown as Pool;

    const result = await generateQuestionnaireInsights(pool, { brand: 'mentolder' });
    expect(result.cached).toBe(true);
    expect(mockEmbedBatch).not.toHaveBeenCalled();
  });

  it('force=true umgeht den Cache-Treffer', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ payload: { cached: true, clusters: [] } }] }) // cache check
        .mockResolvedValueOnce({ rows: [] }) // answers
        .mockResolvedValueOnce({ rows: [] }), // cache insert
    } as unknown as Pool;
    mockEmbedBatch.mockResolvedValue({ embeddings: [], tokens: 0 });

    const result = await generateQuestionnaireInsights(pool, { brand: 'mentolder', force: true });
    expect(result.cached).toBe(false);
    expect(mockEmbedBatch).toHaveBeenCalledTimes(1);
  });
});
