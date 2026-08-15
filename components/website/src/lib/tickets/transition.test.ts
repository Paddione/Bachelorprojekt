import { describe, it, expect, vi } from 'vitest';

const { mockQuery, queueAndReject, mockEmailSend, mockLinkReporter, mockUpdateSuccessor } = vi.hoisted(() => {
  const state: {
    queue: Array<{ rows: unknown[]; rowCount?: number }>;
    nextReject: { code?: string; message: string } | null;
  } = { queue: [], nextReject: null };
  const mockQuery = vi.fn(async () => {
    if (state.nextReject) {
      const err: { code?: string; message: string } = state.nextReject;
      state.nextReject = null;
      throw err;
    }
    if (state.queue.length === 0) return { rows: [], rowCount: 0 };
    return state.queue.shift()!;
  });
  return {
    mockQuery,
    queueAndReject: {
      push: (q: { rows: unknown[]; rowCount?: number }) => state.queue.push(q),
      setReject: (e: { code?: string; message: string } | null) => (state.nextReject = e),
      reset: () => {
        state.queue.length = 0;
        state.nextReject = null;
      },
    },
    mockEmailSend: vi.fn(async () => true),
    mockLinkReporter: vi.fn(async () => 0),
    mockUpdateSuccessor: vi.fn(async () => 0),
  };
});

vi.mock('../db-pool', () => ({
  pool: {
    query: (..._args: unknown[]) => mockQuery(),
    connect: () => ({
      query: (..._args: unknown[]) => mockQuery(),
      release: () => undefined,
    }),
  },
}));

vi.mock('./email-templates', () => ({
  sendBugCloseEmail: (..._args: unknown[]) => mockEmailSend(),
}));

vi.mock('./reporter-link', () => ({
  linkReporterByEmail: (..._args: unknown[]) => mockLinkReporter(),
}));

vi.mock('../ticket-readiness', () => ({
  updateSuccessorReadiness: (..._args: unknown[]) => mockUpdateSuccessor(),
}));

let loadModule: () => Promise<typeof import('./transition')>;

const { beforeEach } = await import('vitest');
beforeEach(() => {
  queueAndReject.reset();
  mockEmailSend.mockClear();
  mockLinkReporter.mockClear();
  mockUpdateSuccessor.mockClear();
  vi.resetModules();
  loadModule = () => import('./transition');
});

describe('isValidStatus', () => {
  it('accepts every known ticket status', async () => {
    const m = await loadModule();
    for (const s of [
      'triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review',
      'qa_review', 'blocked', 'awaiting_deploy', 'done', 'archived',
    ]) {
      expect(m.isValidStatus(s)).toBe(true);
    }
  });

  it('rejects unknown statuses', async () => {
    const m = await loadModule();
    expect(m.isValidStatus('nope')).toBe(false);
    expect(m.isValidStatus('')).toBe(false);
  });
});

describe('transitionTicket', () => {
  it('throws on an invalid status', async () => {
    const m = await loadModule();
    await expect(
      m.transitionTicket('T-1', { status: 'invalid' as never, actor: { label: 'admin' } }),
    ).rejects.toThrow(/invalid/i);
  });

  it('returns a successful TransitionResult on a normal in_progress move', async () => {
    const m = await loadModule();
    queueAndReject.push({ rows: [], rowCount: 0 }); // BEGIN
    queueAndReject.push({ rows: [], rowCount: 0 }); // set_config user_label
    queueAndReject.push({
      rows: [{
        id: 'uuid-1', external_id: 'T000001', type: 'bug', status: 'in_progress', resolution: null,
        reporter_email: null, brand: 'mentolder',
      }],
      rowCount: 1,
    });
    queueAndReject.push({
      rows: [{
        id: 'uuid-1', external_id: 'T000001', type: 'bug', status: 'in_progress', resolution: null,
        reporter_email: null, brand: 'mentolder',
      }],
      rowCount: 1,
    });
    queueAndReject.push({ rows: [], rowCount: 0 }); // COMMIT
    const out = await m.transitionTicket('T-1', {
      status: 'in_progress', actor: { label: 'admin' },
    });
    expect(out.id).toBe('uuid-1');
    expect(out.status).toBe('in_progress');
    expect(out.emailSent).toBe(false);
    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  it('sends a bug close email when transitioning a bug to done', async () => {
    const m = await loadModule();
    queueAndReject.push({ rows: [], rowCount: 0 }); // BEGIN
    queueAndReject.push({ rows: [], rowCount: 0 }); // set_config user_label
    queueAndReject.push({
      rows: [{
        id: 'uuid-2', external_id: 'T000002', type: 'bug', status: 'in_progress', resolution: null,
        reporter_email: 'r@example.com', brand: 'mentolder',
      }],
      rowCount: 1,
    });
    queueAndReject.push({
      rows: [{
        id: 'uuid-2', external_id: 'T000002', type: 'bug', status: 'done', resolution: 'fixed',
        reporter_email: 'r@example.com', brand: 'mentolder',
      }],
      rowCount: 1,
    });
    queueAndReject.push({ rows: [], rowCount: 0 }); // inbox update
    queueAndReject.push({ rows: [], rowCount: 0 }); // COMMIT
    const out = await m.transitionTicket('T-2', {
      status: 'done', resolution: 'fixed', actor: { label: 'admin' },
    });
    expect(out.emailSent).toBe(true);
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
  });

  it('does not send an email when transitioning a non-bug ticket to done', async () => {
    const m = await loadModule();
    queueAndReject.push({ rows: [], rowCount: 0 }); // BEGIN
    queueAndReject.push({ rows: [], rowCount: 0 }); // set_config user_label
    queueAndReject.push({
      rows: [{
        id: 'uuid-3', external_id: 'T000003', type: 'feature', status: 'in_progress', resolution: null,
        reporter_email: null, brand: 'mentolder',
      }],
      rowCount: 1,
    });
    queueAndReject.push({
      rows: [{
        id: 'uuid-3', external_id: 'T000003', type: 'feature', status: 'done', resolution: 'shipped',
        reporter_email: null, brand: 'mentolder',
      }],
      rowCount: 1,
    });
    queueAndReject.push({ rows: [], rowCount: 0 }); // COMMIT
    await m.transitionTicket('T-3', {
      status: 'done', resolution: 'shipped', actor: { label: 'admin' },
    });
    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  it('throws when no ticket row is returned', async () => {
    const m = await loadModule();
    queueAndReject.push({ rows: [], rowCount: 0 }); // BEGIN
    queueAndReject.push({ rows: [], rowCount: 0 }); // set_config user_label
    queueAndReject.push({ rows: [], rowCount: 0 }); // SELECT returns no rows
    await expect(
      m.transitionTicket('T-1', { status: 'in_progress', actor: { label: 'admin' } }),
    ).rejects.toThrow(/not found/i);
  });

  // ── [T002382] Terminal transition guards ────────────────────────────────

  it('throws when transitioning from done to awaiting_deploy (T002382)', async () => {
    const m = await loadModule();
    queueAndReject.push({ rows: [], rowCount: 0 }); // BEGIN
    queueAndReject.push({ rows: [], rowCount: 0 }); // set_config user_label
    queueAndReject.push({
      rows: [{
        id: 'uuid-done', external_id: 'T000099', type: 'feature', status: 'done', resolution: 'shipped',
        reporter_email: null, brand: 'mentolder',
      }],
      rowCount: 1,
    });
    await expect(
      m.transitionTicket('T000099', { status: 'awaiting_deploy', actor: { label: 'admin' } }),
    ).rejects.toThrow(/Cannot transition from 'done' to 'awaiting_deploy'/);
  });

  it('allows transitioning from done to archived (T002382)', async () => {
    const m = await loadModule();
    queueAndReject.push({ rows: [], rowCount: 0 }); // BEGIN
    queueAndReject.push({ rows: [], rowCount: 0 }); // set_config user_label
    queueAndReject.push({
      rows: [{
        id: 'uuid-done2', external_id: 'T000100', type: 'feature', status: 'done', resolution: 'shipped',
        reporter_email: null, brand: 'mentolder',
      }],
      rowCount: 1,
    });
    queueAndReject.push({
      rows: [{
        id: 'uuid-done2', external_id: 'T000100', type: 'feature', status: 'archived', resolution: 'shipped',
        reporter_email: null, brand: 'mentolder',
      }],
      rowCount: 1,
    });
    queueAndReject.push({ rows: [], rowCount: 0 }); // COMMIT
    const out = await m.transitionTicket('T000100', { status: 'archived', resolution: 'shipped', actor: { label: 'admin' } });
    expect(out.status).toBe('archived');
  });

  it('uses COALESCE in the resolution SET to preserve existing value (T002382)', async () => {
    const m = await loadModule();
    const src = m.transitionTicket.toString();
    expect(src).toContain('COALESCE($2, resolution)');
  });

  it('throws when transitioning from archived (T002382)', async () => {
    const m = await loadModule();
    queueAndReject.push({ rows: [], rowCount: 0 }); // BEGIN
    queueAndReject.push({ rows: [], rowCount: 0 }); // set_config user_label
    queueAndReject.push({
      rows: [{
        id: 'uuid-arch', external_id: 'T000102', type: 'feature', status: 'archived', resolution: 'shipped',
        reporter_email: null, brand: 'mentolder',
      }],
      rowCount: 1,
    });
    await expect(
      m.transitionTicket('T000102', { status: 'done', resolution: 'fixed', actor: { label: 'admin' } }),
    ).rejects.toThrow(/Cannot transition from 'archived'/);
  });

  // ── [T003072] Invalid done repair transition ────────────────────────────

  it('allows repairing an invalid done ticket with no resolution and created_at == updated_at (T003072)', async () => {
    const m = await loadModule();
    const now = new Date();
    queueAndReject.push({ rows: [], rowCount: 0 }); // BEGIN
    queueAndReject.push({ rows: [], rowCount: 0 }); // set_config user_label
    queueAndReject.push({
      rows: [{
        id: 'uuid-invalid-done', external_id: 'T003025', type: 'fix', status: 'done', resolution: null,
        created_at: now, updated_at: now,
        reporter_email: null, brand: 'mentolder',
      }],
      rowCount: 1,
    });
    queueAndReject.push({
      rows: [{
        id: 'uuid-invalid-done', external_id: 'T003025', type: 'fix', status: 'in_progress', resolution: null,
        reporter_email: null, brand: 'mentolder',
      }],
      rowCount: 1,
    });
    queueAndReject.push({ rows: [], rowCount: 0 }); // COMMIT
    const out = await m.transitionTicket('T003025', { status: 'in_progress', actor: { label: 'admin' } });
    expect(out.status).toBe('in_progress');
  });
});
