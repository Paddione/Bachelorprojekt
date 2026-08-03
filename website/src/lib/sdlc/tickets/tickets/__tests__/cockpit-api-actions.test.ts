import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIRoute, APIContext } from 'astro';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
  setFeatureAction: vi.fn(),
}));

vi.mock('../../../lib/auth', () => ({
  getSession: mocks.getSession,
  isAdmin: mocks.isAdmin,
}));

vi.mock('../../../lib/tickets/cockpit-db', () => ({
  setFeatureAction: mocks.setFeatureAction,
  BrandMismatchError: class BrandMismatchError extends Error { constructor(m?: string) { super(m); this.name = 'BrandMismatchError'; } },
}));

import { POST as FEATURE_ACTION } from '../../../pages/api/admin/cockpit/feature-action';
import { POST as FEATURE_ACTIONS } from '../../../pages/api/admin/cockpit/feature-actions';

const post = (route: APIRoute, body: unknown): Promise<Response> => Promise.resolve(route({
  request: new Request('http://x', { method: 'POST', headers: { cookie: 'sid=1' }, body: JSON.stringify(body) }),
} as unknown as APIContext) as Response);

beforeEach(() => { vi.clearAllMocks(); process.env.BRAND_ID = 'mentolder'; });

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

// ---------------------------------------------------------------------------
// POST /cockpit/feature-actions (plural) — batch feature actions (B2)
// ---------------------------------------------------------------------------
describe('POST /cockpit/feature-actions', () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ user: {} });
    mocks.isAdmin.mockReturnValue(true);
  });

  it('403 when not admin', async () => {
    mocks.isAdmin.mockReturnValue(false);
    const res = await post(FEATURE_ACTIONS, { actions: [{ featureId: 'f1', action: 'next_step' }] });
    expect(res.status).toBe(403);
  });

  it('400 when actions array missing', async () => {
    const res = await post(FEATURE_ACTIONS, {});
    expect(res.status).toBe(400);
  });

  it('400 when actions is empty', async () => {
    const res = await post(FEATURE_ACTIONS, { actions: [] });
    expect(res.status).toBe(400);
  });

  it('400 when action entry missing featureId', async () => {
    const res = await post(FEATURE_ACTIONS, { actions: [{ action: 'next_step' }] });
    expect(res.status).toBe(400);
  });

  it('200 processes all actions and returns per-entry results', async () => {
    mocks.setFeatureAction.mockResolvedValue({ ok: true });
    const res = await post(FEATURE_ACTIONS, {
      actions: [
        { featureId: 'f1', action: 'next_step', value: true },
        { featureId: 'f2', action: 'discard', value: true },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(2);
    expect(body.results.every((r: { success: boolean }) => r.success)).toBe(true);
    expect(mocks.setFeatureAction).toHaveBeenCalledTimes(2);
    expect(mocks.setFeatureAction).toHaveBeenCalledWith('mentolder', 'f1', 'next_step', true);
    expect(mocks.setFeatureAction).toHaveBeenCalledWith('mentolder', 'f2', 'discard', true);
  });

  it('reports per-action errors without failing the whole batch', async () => {
    const { BrandMismatchError } = await import('../../../lib/tickets/cockpit-db');
    mocks.setFeatureAction
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new BrandMismatchError('cross-brand'));
    const res = await post(FEATURE_ACTIONS, {
      actions: [
        { featureId: 'f1', action: 'next_step', value: true },
        { featureId: 'f2', action: 'next_step', value: false },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0].success).toBe(true);
    expect(body.results[1].success).toBe(false);
  });
});
