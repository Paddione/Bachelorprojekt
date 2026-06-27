import { describe, it, expect, vi } from 'vitest';

const { triggerStore, mockQuery } = vi.hoisted(() => {
  const triggerStore: Array<{ id: string; profile: string; evaluate: (ctx: unknown) => Promise<unknown> }> = [];
  const queryQueue: Array<{ rows: unknown[] }> = [];
  let nextReject: { code?: string; message: string } | null = null;
  const mockQuery = vi.fn(async () => {
    if (nextReject) {
      const err: { code?: string; message: string } = nextReject;
      nextReject = null;
      throw err;
    }
    if (queryQueue.length === 0) return { rows: [] };
    return queryQueue.shift()!;
  });
  return {
    triggerStore,
    queryQueue,
    nextRejectRef: { current: null as { code?: string; message: string } | null },
    mockQuery,
  };
});

const queueAndReject = vi.hoisted(() => {
  const state: {
    queue: Array<{ rows: unknown[] }>;
    nextReject: { code?: string; message: string } | null;
  } = { queue: [], nextReject: null };
  return {
    push: (q: { rows: unknown[] }) => state.queue.push(q),
    setReject: (e: { code?: string; message: string } | null) => (state.nextReject = e),
    reset: () => {
      state.queue.length = 0;
      state.nextReject = null;
    },
    exec: async () => {
      if (state.nextReject) {
        const err: { code?: string; message: string } = state.nextReject;
        state.nextReject = null;
        throw err;
      }
      if (state.queue.length === 0) return { rows: [] };
      return state.queue.shift()!;
    },
  };
});

vi.mock('../triggers', () => ({
  registerTrigger: (def: { id: string; profile: string; evaluate: (ctx: unknown) => Promise<unknown> }) => {
    triggerStore.push(def);
  },
}));

vi.mock('../../website-db', () => ({
  pool: { query: () => queueAndReject.exec() },
}));

let loadTriggers: () => Promise<unknown>;

const { beforeEach } = await import('vitest');
beforeEach(async () => {
  triggerStore.length = 0;
  queueAndReject.reset();
  vi.resetModules();
  loadTriggers = () => import('./admin');
});

function getTrigger(id: string) {
  const t = triggerStore.find((x) => x.id === id);
  if (!t) throw new Error(`trigger ${id} not registered`);
  return t;
}

describe('admin triggers', () => {
  it('registers all four admin triggers on import', async () => {
    await loadTriggers();
    expect(triggerStore.map((t) => t.id).sort()).toEqual(
      [
        'admin-fragebogen-submitted',
        'admin-meeting-imminent',
        'admin-morning-briefing',
        'admin-payment-received',
      ].sort(),
    );
  });

  it('admin-morning-briefing returns null outside /admin routes', async () => {
    await loadTriggers();
    const nudge = await getTrigger('admin-morning-briefing').evaluate({ currentRoute: '/portal' });
    expect(nudge).toBeNull();
  });

  it('admin-morning-briefing returns null when both counts are zero', async () => {
    await loadTriggers();
    queueAndReject.push({ rows: [{ count: '0' }] });
    queueAndReject.push({ rows: [{ count: '0' }] });
    const nudge = await getTrigger('admin-morning-briefing').evaluate({ currentRoute: '/admin' });
    expect(nudge).toBeNull();
  });

  it('admin-morning-briefing produces a nudge when either count is positive', async () => {
    await loadTriggers();
    queueAndReject.push({ rows: [{ count: '3' }] });
    queueAndReject.push({ rows: [{ count: '0' }] });
    const nudge = await getTrigger('admin-morning-briefing').evaluate({ currentRoute: '/admin' });
    expect(nudge).not.toBeNull();
    expect((nudge as { body: string }).body).toContain('3 Termine');
  });

  it('admin-meeting-imminent returns null when no row is found', async () => {
    await loadTriggers();
    queueAndReject.push({ rows: [] });
    expect(await getTrigger('admin-meeting-imminent').evaluate({})).toBeNull();
  });

  it('admin-meeting-imminent builds a nudge from a row', async () => {
    await loadTriggers();
    queueAndReject.push({ rows: [{ id: 'm-1', client_name: 'Alice' }] });
    const nudge = await getTrigger('admin-meeting-imminent').evaluate({});
    expect((nudge as { body: string }).body).toContain('Alice');
  });

  it('admin-meeting-imminent falls back to "Ein Klient" when client_name is null', async () => {
    await loadTriggers();
    queueAndReject.push({ rows: [{ id: 'm-1', client_name: null }] });
    const nudge = await getTrigger('admin-meeting-imminent').evaluate({});
    expect((nudge as { body: string }).body).toContain('Ein Klient');
  });

  it('admin-fragebogen-submitted returns null when no row is found', async () => {
    await loadTriggers();
    queueAndReject.push({ rows: [] });
    expect(await getTrigger('admin-fragebogen-submitted').evaluate({})).toBeNull();
  });

  it('admin-fragebogen-submitted builds a nudge from a row', async () => {
    await loadTriggers();
    queueAndReject.push({
      rows: [{ id: 'q-1', client_name: 'Bob', template_title: 'Pre-Session' }],
    });
    const nudge = await getTrigger('admin-fragebogen-submitted').evaluate({});
    expect((nudge as { body: string }).body).toContain('Bob');
    expect((nudge as { body: string }).body).toContain('Pre-Session');
  });

  it('admin-payment-received formats the amount with two decimals and includes the payer', async () => {
    await loadTriggers();
    queueAndReject.push({
      rows: [{ id: 'pay-1', amount: 99.5, payer: 'Carol', invoice_number: 'R-001' }],
    });
    const nudge = await getTrigger('admin-payment-received').evaluate({});
    expect((nudge as { body: string }).body).toContain('99.50');
    expect((nudge as { body: string }).body).toContain('Carol');
    expect((nudge as { body: string }).body).toContain('R-001');
  });

  it('admin-payment-received coerces string amounts to numbers', async () => {
    await loadTriggers();
    queueAndReject.push({
      rows: [{ id: 'pay-1', amount: '12.34', payer: 'Dave', invoice_number: null }],
    });
    const nudge = await getTrigger('admin-payment-received').evaluate({});
    expect((nudge as { body: string }).body).toContain('12.34');
    expect((nudge as { body: string }).body).toContain('Dave');
  });

  it('returns null and warns once when a table is missing (42P01)', async () => {
    await loadTriggers();
    queueAndReject.setReject({ code: '42P01', message: 'relation not found' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const out = await getTrigger('admin-morning-briefing').evaluate({ currentRoute: '/admin' });
      expect(out).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('propagates non-42P01 errors', async () => {
    await loadTriggers();
    queueAndReject.setReject({ message: 'connection lost' });
    await expect(getTrigger('admin-morning-briefing').evaluate({ currentRoute: '/admin' })).rejects.toThrow(/connection lost/);
  });
});

void mockQuery;
