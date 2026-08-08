import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock auth ----
vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async (cookie: string | null) =>
    cookie === 'admin'
      ? { preferred_username: 'admin', email: 'admin@test', realmRoles: ['admin'] }
      : cookie === 'plain'
        ? { preferred_username: 'plain', email: 'plain@test', realmRoles: [] }
        : null,
  ),
  isAdmin: vi.fn((s: { realmRoles?: string[] } | null | undefined) => s?.realmRoles?.includes('admin') ?? false),
}));

// ---- Mock cockpit-db ----
vi.mock('../../../../lib/sdlc/tickets/cockpit-db', () => ({
  setFeatureAction: vi.fn(async () => ({ ok: true })),
  batchMutate: vi.fn(async () => ({ ok: true, results: [] })),
  updatePlanningRanks: vi.fn(async () => ({ ok: true })),
  reparentTicket: vi.fn(async () => ({ ok: true })),
  BrandMismatchError: class extends Error {},
  CycleError: class extends Error {},
  NotFoundError: class extends Error {},
}));

// ---- Mock factory-floor ----
vi.mock('../../../../lib/sdlc/factory-floor', () => ({
  writeControl: vi.fn(async () => {}),
}));

// ---- Mock website-db (pool for audit) ----
vi.mock('../../../../lib/website-db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}));

import { POST } from './actions';
import * as cockpitDb from '../../../../lib/sdlc/tickets/cockpit-db';
import * as factoryFloor from '../../../../lib/sdlc/factory-floor';
import * as websiteDb from '../../../../lib/website-db';

const setFeatureAction = vi.mocked(cockpitDb.setFeatureAction);
const batchMutate = vi.mocked(cockpitDb.batchMutate);
const updatePlanningRanks = vi.mocked(cockpitDb.updatePlanningRanks);
const reparentTicket = vi.mocked(cockpitDb.reparentTicket);
const writeControl = vi.mocked(factoryFloor.writeControl);
const poolQuery = vi.mocked(websiteDb.pool.query);

beforeEach(() => {
  vi.clearAllMocks();
  setFeatureAction.mockResolvedValue({ ok: true });
  batchMutate.mockResolvedValue({ ok: true, results: [] });
  updatePlanningRanks.mockResolvedValue({ ok: true });
  reparentTicket.mockResolvedValue({ ok: true });
  writeControl.mockResolvedValue(undefined);
});

function req(cookie: string | null, body: unknown): Request {
  return new Request('http://localhost/sdlc/api/cockpit/actions', {
    method: 'POST',
    headers: cookie
      ? { cookie, 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /sdlc/api/cockpit/actions (Task 8)', () => {
  // ---- Auth tests ----
  it('returns 401 without a session', async () => {
    const res = await POST({ request: req(null, { action: 'feature_action', featureId: '42', featAction: 'next_step' }) } as never);
    expect(res.status).toBe(401);
    expect(setFeatureAction).not.toHaveBeenCalled();
  });

  it('returns 401 for a non-admin session', async () => {
    const res = await POST({ request: req('plain', { action: 'feature_action', featureId: '42', featAction: 'next_step' }) } as never);
    expect(res.status).toBe(401);
    expect(setFeatureAction).not.toHaveBeenCalled();
  });

  // ---- Known actions ----
  it('routes feature_action to setFeatureAction', async () => {
    const res = await POST({ request: req('admin', { action: 'feature_action', featureId: '42', featAction: 'next_step' }) } as never);
    expect(res.status).toBe(200);
    expect(setFeatureAction).toHaveBeenCalledTimes(1);
  });

  it('routes reorder to updatePlanningRanks', async () => {
    const res = await POST({ request: req('admin', { action: 'reorder', updates: [{ ticketId: '1', planningRank: 1 }] }) } as never);
    expect(res.status).toBe(200);
    expect(updatePlanningRanks).toHaveBeenCalledTimes(1);
  });

  it('routes reparent to reparentTicket', async () => {
    const res = await POST({ request: req('admin', { action: 'reparent', ticketId: '42', newParentId: null }) } as never);
    expect(res.status).toBe(200);
    expect(reparentTicket).toHaveBeenCalledTimes(1);
  });

  it('routes factory_tick to writeControl', async () => {
    const res = await POST({ request: req('admin', { action: 'factory_tick' }) } as never);
    expect(res.status).toBe(200);
    expect(writeControl).toHaveBeenCalledTimes(1);
  });

  // ---- Audit: success line ----
  it('writes an audit success row for a successful action', async () => {
    await POST({ request: req('admin', { action: 'feature_action', featureId: '42', featAction: 'next_step' }) } as never);
    const auditCalls = poolQuery.mock.calls.filter((c) => {
      const sql = String((c as [string, ...unknown[]])[0] ?? '');
      return sql.includes('cockpit_audit');
    });
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
    // pool.query(sql, values[]) → mock.calls[0] = [sql, valuesArray]
    const queryArgs = (auditCalls[0] as unknown[]) as [string, unknown[]];
    expect(queryArgs[1][3]).toBe('success');
  });

  // ---- Audit: failure line ----
  it('writes an audit failure row when the action throws', async () => {
    setFeatureAction.mockRejectedValueOnce(new Error('simulated failure'));
    await POST({ request: req('admin', { action: 'feature_action', featureId: '42', featAction: 'next_step' }) } as never);
    const auditCalls = poolQuery.mock.calls.filter((c) => {
      const sql = String((c as [string, ...unknown[]])[0] ?? '');
      return sql.includes('cockpit_audit');
    });
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
    const queryArgs = (auditCalls[0] as unknown[]) as [string, unknown[]];
    expect(queryArgs[1][3]).toBe('failure');
  });

  // ---- Unknown action ----
  it('returns 400 for an unknown action name', async () => {
    const res = await POST({ request: req('admin', { action: 'nonexistent_action' }) } as never);
    expect(res.status).toBe(400);
  });
});
