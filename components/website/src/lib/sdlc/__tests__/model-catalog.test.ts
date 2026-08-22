import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../db-pool', () => ({
  pool: {
    query: (text: string, params?: unknown[]) =>
      params !== undefined ? mockQuery(text, params) : mockQuery(text),
  },
}));

import { resolveModelCatalog } from '../model-catalog';

const DB_ROWS = {
  rows: [
    { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001' },
    { provider: 'local-cluster', model_id: 'gemma26-throughput' },
    { provider: 'deepseek', model_id: 'deepseek-v4-flash' },
  ],
};

// Zwei Backends: b1 (Prio 1, gesund) liefert gemma26-throughput; b2 (Prio 2,
// gesund) liefert nur qwen38. claude-haiku und deepseek-v4-flash serviert
// kein Backend.
const PROXY_STATE = {
  status: [
    {
      name: 'b1',
      base_url: 'http://127.0.0.1:8092',
      enabled: true,
      health: 'ok',
      priority: 1,
      models: [{ id: 'gemma26-throughput', loaded: true }, { id: 'qwen3.8-27b', loaded: false }],
    },
    {
      name: 'b2',
      base_url: 'http://127.0.0.1:8094',
      enabled: true,
      health: 'ok',
      priority: 2,
      models: [{ id: 'qwen3.8-27b', loaded: true }],
    },
    {
      name: 'b3',
      base_url: 'http://127.0.0.1:8099',
      enabled: true,
      health: 'unhealthy',
      priority: 0,
      models: [{ id: 'claude-haiku-4-5-20251001', loaded: false }],
    },
  ],
};

function stubProxyState() {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify(PROXY_STATE), { status: 200 })));
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue(DB_ROWS);
  vi.unstubAllGlobals();
});

describe('resolveModelCatalog', () => {
  it('dedupliziert Modelle, die Proxy und DB beide nennen', async () => {
    const state = structuredClone(PROXY_STATE);
    // b1 meldet zusätzlich ein Modell, das auch in der DB steht
    state.status[0].models.push({ id: 'claude-haiku-4-5-20251001', loaded: false });
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify(state), { status: 200 })));

    const { entries } = await resolveModelCatalog();
    const haiku = entries.filter((e) => e.modelId === 'claude-haiku-4-5-20251001');
    expect(haiku).toHaveLength(1);
    expect(haiku[0].provider).toBe('anthropic');
  });

  it('enthält ein nur vom Proxy gemeldetes Modell', async () => {
    stubProxyState();
    const { entries } = await resolveModelCatalog();
    const proxyOnly = entries.find((e) => e.modelId === 'qwen3.8-27b');
    expect(proxyOnly).toBeDefined();
    expect(proxyOnly?.available).toBe(true);
  });

  it('behält ein konfiguriertes Modell ohne erreichbares Backend und markiert es als nicht verfügbar', async () => {
    stubProxyState();
    const { entries } = await resolveModelCatalog();
    // deepseek-v4-flash ist konfiguriert, aber kein gesundes Backend serviert es
    const deepseek = entries.find((e) => e.modelId === 'deepseek-v4-flash');
    expect(deepseek).toBeDefined();
    expect(deepseek?.available).toBe(false);
    // dasselbe gilt für das nur von einem UNGESUNDEN Backend gemeldete Haiku
    const haiku = entries.find((e) => e.modelId === 'claude-haiku-4-5-20251001');
    expect(haiku).toBeDefined();
    expect(haiku?.available).toBe(false);
  });

  it('erhält bei nicht erreichbarem Proxy die DB-Menge vollständig mit unbekannter Verfügbarkeit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const { entries, proxyOnline } = await resolveModelCatalog();
    expect(proxyOnline).toBe(false);
    expect(entries.map((e) => e.modelId)).toEqual(
      expect.arrayContaining(['claude-haiku-4-5-20251001', 'gemma26-throughput', 'deepseek-v4-flash']),
    );
    for (const entry of entries) {
      expect(entry.available).toBeNull();
    }
  });
});
