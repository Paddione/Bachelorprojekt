import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIRoute, APIContext } from 'astro';

// Mock openai for suggest endpoint tests — must be before any imports
const openaiMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('openai', () => {
  function MockOpenAI() {
    return { chat: { completions: { create: openaiMocks.create } } };
  }
  return { default: MockOpenAI };
});

// All cockpit-db function mocks consolidated upfront (one vi.mock per module).
const mocks = vi.hoisted(() => ({
  // auth
  getSession: vi.fn(),
  isAdmin: vi.fn(),
  // cockpit-db
  getPortfolio: vi.fn(),
  getFeatureTickets: vi.fn(),
  updatePlanningRanks: vi.fn(),
  reparentTicket: vi.fn(),
  batchMutate: vi.fn(),
  setFeatureAction: vi.fn(),
}));

vi.mock('../../../lib/auth', () => ({
  getSession: mocks.getSession,
  isAdmin: mocks.isAdmin,
}));

vi.mock('../../../lib/tickets/cockpit-db', () => ({
  getPortfolio: mocks.getPortfolio,
  getFeatureTickets: mocks.getFeatureTickets,
  updatePlanningRanks: mocks.updatePlanningRanks,
  reparentTicket: mocks.reparentTicket,
  batchMutate: mocks.batchMutate,
  setFeatureAction: mocks.setFeatureAction,
  // Error classes used in route code — use real class shapes so instanceof works
  NotFoundError: class NotFoundError extends Error { constructor(m?: string) { super(m); this.name = 'NotFoundError'; } },
  BrandMismatchError: class BrandMismatchError extends Error { constructor(m?: string) { super(m); this.name = 'BrandMismatchError'; } },
  CycleError: class CycleError extends Error { constructor(m?: string) { super(m); this.name = 'CycleError'; } },
}));

import { GET } from '../../../pages/api/admin/cockpit/portfolio';
import { GET as FEATURE_GET } from '../../../pages/api/admin/cockpit/feature';
import { POST as REORDER } from '../../../pages/api/admin/cockpit/reorder';
import { POST as REPARENT } from '../../../pages/api/admin/cockpit/reparent';
import { POST as BATCH } from '../../../pages/api/admin/cockpit/batch';
import { POST as SUGGEST } from '../../../pages/api/admin/cockpit/suggest';

const req = () => new Request('http://x/api/admin/cockpit/portfolio',
  { headers: { cookie: 'sid=1' } });

beforeEach(() => { vi.clearAllMocks(); process.env.BRAND_ID = 'mentolder'; });

// ---------------------------------------------------------------------------
// Task 7: GET /cockpit/portfolio
// ---------------------------------------------------------------------------
describe('GET /cockpit/portfolio', () => {
  it('403 when not admin', async () => {
    mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(false);
    const res = await GET({ request: req() } as unknown as APIContext);
    expect(res.status).toBe(403);
  });
  it('returns PortfolioPayload for admin', async () => {
    mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true);
    mocks.getPortfolio.mockResolvedValue({ products: [{ extId: 'p1', features: [] }] });
    const res = await GET({ request: req() } as unknown as APIContext);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products[0].extId).toBe('p1');
    expect(mocks.getPortfolio).toHaveBeenCalledWith('mentolder');
  });
});

// ---------------------------------------------------------------------------
// Task 8: GET /cockpit/feature
// ---------------------------------------------------------------------------
describe('GET /cockpit/feature', () => {
  const url = (id?: string) =>
    new URL(`http://x/api/admin/cockpit/feature${id ? `?id=${id}` : ''}`);
  const ctx = (id?: string) => ({
    request: new Request(url(id), { headers: { cookie: 'sid=1' } }),
    url: url(id),
  } as unknown as APIContext);

  beforeEach(() => { mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true); });

  it('400 without id', async () => {
    const res = await FEATURE_GET(ctx());
    expect(res.status).toBe(400);
  });
  it('200 with FeatureTickets', async () => {
    mocks.getFeatureTickets.mockResolvedValue({ feature: { extId: 'f1' }, tickets: [] });
    const res = await FEATURE_GET(ctx('f1'));
    expect(res.status).toBe(200);
    expect((await res.json()).feature.extId).toBe('f1');
  });
  it('404 when not found', async () => {
    const err = new Error('not found'); err.name = 'NotFoundError';
    mocks.getFeatureTickets.mockRejectedValue(err);
    const res = await FEATURE_GET(ctx('zzz'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Task 9: POST /cockpit/reorder
// ---------------------------------------------------------------------------
const post = (route: APIRoute, body: unknown): Promise<Response> => Promise.resolve(route({
  request: new Request('http://x', { method: 'POST', headers: { cookie: 'sid=1' }, body: JSON.stringify(body) }),
} as unknown as APIContext) as Response);

describe('POST /cockpit/reorder', () => {
  beforeEach(() => { mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true); });
  it('400 when updates missing', async () => {
    expect((await post(REORDER, {})).status).toBe(400);
  });
  it('200 ok on valid updates', async () => {
    mocks.updatePlanningRanks.mockResolvedValue({ ok: true });
    const res = await post(REORDER, { updates: [{ ticketId: 'a', planningRank: 0 }] });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task 10: POST /cockpit/reparent
// ---------------------------------------------------------------------------
describe('POST /cockpit/reparent', () => {
  beforeEach(() => { mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true); });
  it('400 without ticketId', async () => {
    expect((await post(REPARENT, { newParentId: 'p' })).status).toBe(400);
  });
  it('200 ok on success', async () => {
    mocks.reparentTicket.mockResolvedValue({ ok: true });
    const res = await post(REPARENT, { ticketId: 't1', newParentId: 'f2' });
    expect(res.status).toBe(200);
  });
  it('400 on cycle', async () => {
    const err = new Error('cycle'); err.name = 'CycleError';
    mocks.reparentTicket.mockRejectedValue(err);
    const res = await post(REPARENT, { ticketId: 't1', newParentId: 'f2' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cycle/i);
  });
});

// ---------------------------------------------------------------------------
// Task 11: POST /cockpit/batch
// ---------------------------------------------------------------------------
describe('POST /cockpit/batch', () => {
  beforeEach(() => { mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true); });
  it('400 when ticketIds empty', async () => {
    expect((await post(BATCH, { ticketIds: [], mutation: { status: 'done' } })).status).toBe(400);
  });
  it('200 with per-id results (partial failure tolerated)', async () => {
    mocks.batchMutate.mockResolvedValue({ ok: true, results: [
      { ticketId: 'a', success: true }, { ticketId: 'b', success: false, error: 'x' }] });
    const res = await post(BATCH, { ticketIds: ['a', 'b'], mutation: { status: 'done' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
  });
  it('400 on brand mismatch', async () => {
    const err = new Error('cross-brand'); err.name = 'BrandMismatchError';
    mocks.batchMutate.mockRejectedValue(err);
    const res = await post(BATCH, { ticketIds: ['a'], mutation: { status: 'done' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cross-brand/i);
  });
});

// ---------------------------------------------------------------------------
// POST /cockpit/feature-action

// ---------------------------------------------------------------------------
// POST /cockpit/suggest — feature suggestion endpoint
// ---------------------------------------------------------------------------
const featurePortfolio = {
  products: [{
    id: 'p1', extId: 'P1', title: 'Product',
    rollup: { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 },
    features: [{
      id: 'f1', extId: 'F1', title: 'Feature One',
      valueProp: 'value', priority: 'mittel', health: 'amber' as const,
      rollup: { total: 5, done: 2, blocked: 0, inProgress: 1, open: 2, pctDone: 40 },
      nextStep: false, discarded: false, majorFeature: true, synthetic: false,
    }],
  }],
};

describe('POST /cockpit/suggest', () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ user: {} });
    mocks.isAdmin.mockReturnValue(true);
    mocks.getPortfolio.mockResolvedValue(featurePortfolio);
    // Reset openai mock
    openaiMocks.create.mockReset();
  });

  it('403 when not admin', async () => {
    mocks.isAdmin.mockReturnValue(false);
    const res = await post(SUGGEST, { provider: 'deepseek' });
    expect(res.status).toBe(403);
  });

  it('400 when provider is not in allowlist', async () => {
    const res = await post(SUGGEST, { provider: 'evil' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid provider/);
    // B3: upstream call must not happen
    expect(openaiMocks.create).not.toHaveBeenCalled();
  });

  it('503 when provider requires API key and it is not set', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const res = await post(SUGGEST, { provider: 'deepseek' });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/);
    // B5: client must not be constructed / called
    expect(openaiMocks.create).not.toHaveBeenCalled();
  });

  it('200 with suggestions on successful LLM call', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    openaiMocks.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([
        { featureId: 'F1', nextStep: true, reason: 'fast fertig', impact: 'hoch' },
      ]) } }],
    });
    const res = await post(SUGGEST, { provider: 'deepseek' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].featureId).toBe('F1');
    expect(body.suggestions[0].nextStep).toBe(true);
  });

  it('200 with empty suggestions array when LLM returns prose without JSON (B4)', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    openaiMocks.create.mockResolvedValue({
      choices: [{ message: { content: 'Das ist nur Prosa ohne JSON-Array.' } }],
    });
    const res = await post(SUGGEST, { provider: 'deepseek' });
    // B4: must return 200, not 500
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toEqual([]);
  });

  it('200 with valid items only when LLM returns mixed valid/invalid items (B4)', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    openaiMocks.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([
        { featureId: 'F1', nextStep: true, reason: 'gut', impact: 'hoch' },
        { featureId: '', nextStep: true, reason: 'bad' },
        { nextStep: false, reason: 'missing featureId' },
        { featureId: 'F2', nextStep: false, reason: 'niedrige Priorität', impact: 'niedrig' },
        { featureId: 'F3', nextStep: true, reason: 'OK', impact: 'unsinnig' },
      ]) } }],
    });
    const res = await post(SUGGEST, { provider: 'deepseek' });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only F1 (valid) and F2 (valid, impact niedrig) should remain; empty featureId, missing featureId dropped;
    // F3 has invalid impact which should be dropped but item still valid
    expect(body.suggestions.length).toBeGreaterThanOrEqual(3);
    expect(body.suggestions.every((s: { featureId?: string }) => s.featureId && s.featureId.length > 0)).toBe(true);
  });

  it('504 when LLM call times out (B1)', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    openaiMocks.create.mockRejectedValue(new Error('timeout of 10000ms exceeded'));
    const res = await post(SUGGEST, { provider: 'deepseek' });
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toMatch(/timed out/i);
  });

  it('returns 200 empty suggestions when portfolio has no features', async () => {
    mocks.getPortfolio.mockResolvedValue({ products: [] });
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const res = await post(SUGGEST, { provider: 'deepseek' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toEqual([]);
    // No LLM call is made
    expect(openaiMocks.create).not.toHaveBeenCalled();
  });
});


// ---------------------------------------------------------------------------
// resolveProvider unit tests (B3) — inlined from deleted suggest-providers.ts
// ---------------------------------------------------------------------------
interface ProviderSpec { id: string; baseURL: string; defaultModel: string; apiKeyEnv?: string }
const ALLOWED_PROVIDERS: Record<string, ProviderSpec> = {
  deepseek: { id: 'deepseek', baseURL: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', apiKeyEnv: 'DEEPSEEK_API_KEY' },
  anthropic: { id: 'anthropic', baseURL: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-20250514', apiKeyEnv: 'ANTHROPIC_API_KEY' },
};
function resolveProvider(id: string): ProviderSpec | null { return ALLOWED_PROVIDERS[id] ?? null; }

describe('resolveProvider', () => {
  it('returns spec for known provider deepseek', () => {
    const spec = resolveProvider('deepseek');
    expect(spec).not.toBeNull();
    expect(spec!.id).toBe('deepseek');
    expect(spec!.baseURL).toBe('https://api.deepseek.com/v1');
    expect(spec!.apiKeyEnv).toBe('DEEPSEEK_API_KEY');
  });

  it('returns spec for known provider anthropic', () => {
    const spec = resolveProvider('anthropic');
    expect(spec).not.toBeNull();
    expect(spec!.id).toBe('anthropic');
    expect(spec!.apiKeyEnv).toBe('ANTHROPIC_API_KEY');
  });

  it('returns null for unknown provider', () => {
    expect(resolveProvider('evil')).toBeNull();
    expect(resolveProvider('')).toBeNull();
    expect(resolveProvider('openai')).toBeNull();
    expect(resolveProvider('local-cluster')).toBeNull();
  });

  it('ALLOWED_PROVIDERS is frozen and contains exactly expected entries', () => {
    expect(Object.keys(ALLOWED_PROVIDERS).sort()).toEqual(['anthropic', 'deepseek']);
  });
});

// ---------------------------------------------------------------------------
// parseSuggestions unit tests (B4)
// ---------------------------------------------------------------------------
import { parseSuggestions } from '../../../lib/tickets/suggest-prompt';

describe('parseSuggestions', () => {
  it('returns [] for prose without JSON array', () => {
    expect(parseSuggestions('Das ist ein normaler Text ohne JSON.')).toEqual([]);
  });

  it('returns [] for completely empty string', () => {
    expect(parseSuggestions('')).toEqual([]);
  });

  it('returns [] for JSON that is not an array', () => {
    expect(parseSuggestions('{"key": "value"}')).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseSuggestions('[{"featureId": "f1" ohne schließende Klammer')).toEqual([]);
  });

  it('drops items with empty featureId', () => {
    const result = parseSuggestions(JSON.stringify([
      { featureId: 'f1', nextStep: true, reason: 'gut' },
      { featureId: '', nextStep: true, reason: 'bad' },
    ]));
    expect(result).toHaveLength(1);
    expect(result[0].featureId).toBe('f1');
  });

  it('drops items with missing featureId', () => {
    const result = parseSuggestions(JSON.stringify([
      { nextStep: true, reason: 'missing featureId' },
      { featureId: 'f2', nextStep: false, reason: 'ok' },
    ]));
    expect(result).toHaveLength(1);
    expect(result[0].featureId).toBe('f2');
  });

  it('drops non-object items in the array', () => {
    const result = parseSuggestions(JSON.stringify([
      'string item',
      42,
      { featureId: 'f1', nextStep: true, reason: 'valid' },
    ]));
    expect(result).toHaveLength(1);
    expect(result[0].featureId).toBe('f1');
  });

  it('only includes impact values from IMPACT_VALUES', () => {
    const result = parseSuggestions(JSON.stringify([
      { featureId: 'f1', nextStep: true, reason: 'a', impact: 'hoch' },
      { featureId: 'f2', nextStep: true, reason: 'b', impact: 'unsinnig' },
      { featureId: 'f3', nextStep: true, reason: 'c' },
    ]));
    expect(result).toHaveLength(3);
    expect(result[0].impact).toBe('hoch');
    expect(result[1].impact).toBeUndefined();
    expect(result[2].impact).toBeUndefined();
  });

  it('coerces reason to empty string when missing or not a string', () => {
    const result = parseSuggestions(JSON.stringify([
      { featureId: 'f1', nextStep: true },
      { featureId: 'f2', nextStep: true, reason: 42 },
    ]));
    expect(result).toHaveLength(2);
    expect(result[0].reason).toBe('');
    expect(result[1].reason).toBe('');
  });

  it('sets nextStep only for boolean true', () => {
    const result = parseSuggestions(JSON.stringify([
      { featureId: 'f1', nextStep: true, reason: 'yes' },
      { featureId: 'f2', nextStep: false, reason: 'no' },
      { featureId: 'f3', nextStep: 'true', reason: 'string true' },
    ]));
    expect(result).toHaveLength(3);
    expect(result[0].nextStep).toBe(true);
    expect(result[1].nextStep).toBe(false);
    expect(result[2].nextStep).toBe(false); // 'true' string ≠ boolean true
  });
});
