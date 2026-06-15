import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { POST as FEATURE_ACTION } from '../../../pages/api/admin/cockpit/feature-action';

const req = () => new Request('http://x/api/admin/cockpit/portfolio',
  { headers: { cookie: 'sid=1' } });

beforeEach(() => { vi.clearAllMocks(); process.env.BRAND_ID = 'mentolder'; });

// ---------------------------------------------------------------------------
// Task 7: GET /cockpit/portfolio
// ---------------------------------------------------------------------------
describe('GET /cockpit/portfolio', () => {
  it('403 when not admin', async () => {
    mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(false);
    const res = await GET({ request: req() } as any);
    expect(res.status).toBe(403);
  });
  it('returns PortfolioPayload for admin', async () => {
    mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true);
    mocks.getPortfolio.mockResolvedValue({ products: [{ extId: 'p1', features: [] }] });
    const res = await GET({ request: req() } as any);
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
  } as any);

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
const post = (route: any, body: unknown) => route({
  request: new Request('http://x', { method: 'POST', headers: { cookie: 'sid=1' }, body: JSON.stringify(body) }),
} as any);

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
describe('POST /cockpit/feature-action', () => {
  beforeEach(() => { mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true); });
  it('403 when not admin', async () => {
    mocks.isAdmin.mockReturnValue(false);
    const res = await post(FEATURE_ACTION, { featureId: 'f1', action: 'next_step' });
    expect(res.status).toBe(403);
  });
  it('400 when featureId missing', async () => {
    const res = await post(FEATURE_ACTION, { action: 'next_step' });
    expect(res.status).toBe(400);
  });
  it('400 when action missing', async () => {
    const res = await post(FEATURE_ACTION, { featureId: 'f1' });
    expect(res.status).toBe(400);
  });
  it('400 when action is invalid', async () => {
    const res = await post(FEATURE_ACTION, { featureId: 'f1', action: 'bogus' });
    expect(res.status).toBe(400);
  });
  it('200 sets next_step', async () => {
    mocks.setFeatureAction.mockResolvedValue({ ok: true });
    const res = await post(FEATURE_ACTION, { featureId: 'f1', action: 'next_step', value: true });
    expect(res.status).toBe(200);
    expect(mocks.setFeatureAction).toHaveBeenCalledWith('mentolder', 'f1', 'next_step', true);
  });
  it('200 sets discard', async () => {
    mocks.setFeatureAction.mockResolvedValue({ ok: true });
    const res = await post(FEATURE_ACTION, { featureId: 'f2', action: 'discard', value: true });
    expect(res.status).toBe(200);
    expect(mocks.setFeatureAction).toHaveBeenCalledWith('mentolder', 'f2', 'discard', true);
  });
  it('200 sets major', async () => {
    mocks.setFeatureAction.mockResolvedValue({ ok: true });
    const res = await post(FEATURE_ACTION, { featureId: 'f3', action: 'major', value: false });
    expect(res.status).toBe(200);
    expect(mocks.setFeatureAction).toHaveBeenCalledWith('mentolder', 'f3', 'major', false);
  });
  it('200 sets comment', async () => {
    mocks.setFeatureAction.mockResolvedValue({ ok: true });
    const res = await post(FEATURE_ACTION, { featureId: 'f1', action: 'comment', value: 'needs review' });
    expect(res.status).toBe(200);
    expect(mocks.setFeatureAction).toHaveBeenCalledWith('mentolder', 'f1', 'comment', 'needs review');
  });
  it('400 on brand mismatch', async () => {
    const { BrandMismatchError } = await import('../../../lib/tickets/cockpit-db');
    mocks.setFeatureAction.mockRejectedValue(new BrandMismatchError('wrong brand'));
    const res = await post(FEATURE_ACTION, { featureId: 'f1', action: 'next_step' });
    expect(res.status).toBe(400);
  });
});
