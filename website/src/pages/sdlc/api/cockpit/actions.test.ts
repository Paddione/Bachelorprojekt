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
  stageTicketPlan: vi.fn(async () => ({ ok: true, ticketId: 't', status: 'plan_staged' })),
  releaseTicketHold: vi.fn(async () => ({ ok: true, ticketId: 't' })),
  closeTicket: vi.fn(async () => ({ ok: true, ticketId: 't', from: 'in_review', to: 'done' })),
  isValidTicketId: vi.fn((id: string) => /^[0-9a-f-]{36}$/i.test(id)),
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
const stageTicketPlan = vi.mocked(cockpitDb.stageTicketPlan);
const releaseTicketHold = vi.mocked(cockpitDb.releaseTicketHold);
const closeTicket = vi.mocked(cockpitDb.closeTicket);
const isValidTicketId = vi.mocked(cockpitDb.isValidTicketId);
const writeControl = vi.mocked(factoryFloor.writeControl);
const poolQuery = vi.mocked(websiteDb.pool.query);

beforeEach(() => {
  vi.clearAllMocks();
  setFeatureAction.mockResolvedValue({ ok: true });
  batchMutate.mockResolvedValue({ ok: true, results: [] });
  updatePlanningRanks.mockResolvedValue({ ok: true });
  reparentTicket.mockResolvedValue({ ok: true });
  stageTicketPlan.mockResolvedValue({ ok: true, ticketId: 't', status: 'plan_staged' });
  releaseTicketHold.mockResolvedValue({ ok: true, ticketId: 't' });
  closeTicket.mockResolvedValue({ ok: true, ticketId: 't', from: 'in_review', to: 'done' });
  isValidTicketId.mockImplementation((id: string) => /^[0-9a-f-]{36}$/i.test(id));
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

  it('routes ticket_stage_plan to stageTicketPlan (DB, no shell)', async () => {
    const res = await POST({
      request: req('admin', { action: 'ticket_stage_plan', ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', plan: 'openspec/changes/foo/tasks.md', branch: 'feature/foo' }),
    } as never);
    expect(res.status).toBe(200);
    expect(stageTicketPlan).toHaveBeenCalledTimes(1);
    const [brand, ticketId, plan, branch, actor, opts] = vi.mocked(stageTicketPlan).mock.calls[0];
    expect(brand).toBe('mentolder');
    expect(ticketId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(plan).toContain('foo');
    expect(branch).toContain('feature');
    expect(actor).toBe('admin');
    expect(opts).toEqual({ hold: false, partials: 1 });
  });

  it('rejects ticket_stage_plan with a non-UUID ticketId', async () => {
    const res = await POST({
      request: req('admin', { action: 'ticket_stage_plan', ticketId: 'T000123', plan: 'p.md', branch: 'b' }),
    } as never);
    expect(res.status).toBe(400);
    expect(stageTicketPlan).not.toHaveBeenCalled();
  });

  it('clamps ticket_stage_plan partials to 1..9 (mirrors stage-plan.sh [1-9])', async () => {
    const res = await POST({
      request: req('admin', { action: 'ticket_stage_plan', ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', plan: 'p.md', branch: 'b', partials: 0 }),
    } as never);
    expect(res.status).toBe(200);
    expect(stageTicketPlan).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(stageTicketPlan).mock.calls[0][5];
    expect(opts).toEqual({ hold: false, partials: 1 });

    vi.mocked(stageTicketPlan).mockClear();
    await POST({
      request: req('admin', { action: 'ticket_stage_plan', ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', plan: 'p.md', branch: 'b', partials: 12 }),
    } as never);
    const opts2 = vi.mocked(stageTicketPlan).mock.calls[0][5];
    expect(opts2).toEqual({ hold: false, partials: 1 });

    vi.mocked(stageTicketPlan).mockClear();
    await POST({
      request: req('admin', { action: 'ticket_stage_plan', ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', plan: 'p.md', branch: 'b', partials: 5 }),
    } as never);
    const opts3 = vi.mocked(stageTicketPlan).mock.calls[0][5];
    expect(opts3).toEqual({ hold: false, partials: 5 });
  });

  it('rejects ticket_close with an invalid resolution', async () => {
    const res = await POST({
      request: req('admin', { action: 'ticket_close', ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', resolution: 'whoops' }),
    } as never);
    expect(res.status).toBe(400);
    expect(closeTicket).not.toHaveBeenCalled();
  });

  it('routes ticket_close to closeTicket', async () => {
    const res = await POST({
      request: req('admin', { action: 'ticket_close', ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', resolution: 'shipped' }),
    } as never);
    expect(res.status).toBe(200);
    expect(closeTicket).toHaveBeenCalledTimes(1);
    expect(vi.mocked(closeTicket).mock.calls[0][2]).toBe('shipped');
  });

  it('flux_reconcile returns 503 when FLUX_WEBHOOK_URL is missing', async () => {
    delete process.env.FLUX_WEBHOOK_URL;
    const res = await POST({ request: req('admin', { action: 'flux_reconcile' }) } as never);
    expect(res.status).toBe(503);
  });

  it('flux_reconcile rejects an invalid kustomization name', async () => {
    const res = await POST({ request: req('admin', { action: 'flux_reconcile', target: '../evil' }) } as never);
    expect(res.status).toBe(400);
  });

  it('ci_rerun returns 503 when GITHUB_PAT is missing', async () => {
    delete process.env.GITHUB_PAT;
    const res = await POST({ request: req('admin', { action: 'ci_rerun', runId: '42' }) } as never);
    expect(res.status).toBe(503);
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
