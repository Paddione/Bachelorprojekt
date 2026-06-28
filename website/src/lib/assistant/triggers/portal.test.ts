import { describe, it, expect, vi } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() },
  createRequestLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() })),
}));
import * as loggerModule from '../../logger';

const { triggerStore, seenAtStore, listFirstSeenAt, recordFirstSeen, queueAndReject, mockQuery } = vi.hoisted(() => {
  const triggerStore: Array<{ id: string; profile: string; evaluate: (ctx: unknown) => Promise<unknown> }> = [];
  const seenAtStore: Array<{ userSub: string; profile: string; at: Date | null }> = [];
  const listFirstSeenAt = vi.fn(async (userSub: string, profile: string) => {
    const e = seenAtStore.find((s) => s.userSub === userSub && s.profile === profile);
    return e?.at ?? null;
  });
  const recordFirstSeen = vi.fn(async (userSub: string, profile: string) => {
    const i = seenAtStore.findIndex((s) => s.userSub === userSub && s.profile === profile);
    if (i >= 0) seenAtStore[i].at = new Date();
    else seenAtStore.push({ userSub, profile, at: new Date() });
  });
  const queueAndReject = (() => {
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
  })();
  const mockQuery = vi.fn(async () => queueAndReject.exec());
  return { triggerStore, seenAtStore, listFirstSeenAt, recordFirstSeen, queueAndReject, mockQuery };
});

vi.mock('../triggers', () => ({
  registerTrigger: (def: { id: string; profile: string; evaluate: (ctx: unknown) => Promise<unknown> }) => {
    triggerStore.push(def);
  },
}));

vi.mock('../dismissals', () => ({
  listFirstSeenAt,
  recordFirstSeen,
}));

vi.mock('../../website-db', () => ({
  pool: { query: () => mockQuery() },
}));

let loadTriggers: () => Promise<unknown>;

const { beforeEach } = await import('vitest');
beforeEach(async () => {
  triggerStore.length = 0;
  seenAtStore.length = 0;
  queueAndReject.reset();
  vi.resetModules();
  loadTriggers = () => import('./portal');
});

function getTrigger(id: string) {
  const t = triggerStore.find((x) => x.id === id);
  if (!t) throw new Error(`trigger ${id} not registered`);
  return t;
}

describe('portal triggers', () => {
  it('registers all six portal triggers on import', async () => {
    await loadTriggers();
    expect(triggerStore.map((t) => t.id).sort()).toEqual(
      [
        'portal-first-login',
        'portal-fragebogen-open',
        'portal-new-coach-message',
        'portal-session-1h',
        'portal-session-24h',
        'portal-signature-pending',
      ].sort(),
    );
  });

  it('portal-first-login returns null outside /portal routes', async () => {
    await loadTriggers();
    const nudge = await getTrigger('portal-first-login').evaluate({ userSub: 'u1', currentRoute: '/admin' });
    expect(nudge).toBeNull();
  });

  it('portal-first-login returns null when the user has already been seen', async () => {
    await loadTriggers();
    seenAtStore.push({ userSub: 'u1', profile: 'portal', at: new Date() });
    const nudge = await getTrigger('portal-first-login').evaluate({ userSub: 'u1', currentRoute: '/portal' });
    expect(nudge).toBeNull();
  });

  it('portal-first-login records the first seen and returns a nudge', async () => {
    await loadTriggers();
    const nudge = await getTrigger('portal-first-login').evaluate({ userSub: 'u1', currentRoute: '/portal' });
    expect(nudge).not.toBeNull();
    expect(seenAtStore).toHaveLength(1);
    expect(seenAtStore[0].userSub).toBe('u1');
  });

  it('portal-signature-pending returns null when no row is found', async () => {
    await loadTriggers();
    expect(await getTrigger('portal-signature-pending').evaluate({ userSub: 'u1' })).toBeNull();
  });

  it('portal-signature-pending builds a nudge from a row', async () => {
    await loadTriggers();
    queueAndReject.push({ rows: [{ id: 'd-1', title: 'Vertrag' }] });
    const nudge = await getTrigger('portal-signature-pending').evaluate({ userSub: 'u1' });
    expect((nudge as { body: string }).body).toContain('Vertrag');
  });

  it('portal-signature-pending uses a generic "Dokument" fallback when title is null', async () => {
    await loadTriggers();
    queueAndReject.push({ rows: [{ id: 'd-1', title: null }] });
    const nudge = await getTrigger('portal-signature-pending').evaluate({ userSub: 'u1' });
    expect((nudge as { body: string }).body).toContain('Dokument');
  });

  it('portal-session-24h formats a localized weekday in the body', async () => {
    await loadTriggers();
    const dt = new Date('2026-06-30T10:00:00Z');
    queueAndReject.push({ rows: [{ id: 'm-1', scheduled_at: dt }] });
    const nudge = await getTrigger('portal-session-24h').evaluate({ userSub: 'u1' });
    expect(nudge).not.toBeNull();
    expect((nudge as { headline: string }).headline).toBe('Morgen Termin');
  });

  it('portal-session-1h returns null when no meeting is upcoming in 70 minutes', async () => {
    await loadTriggers();
    expect(await getTrigger('portal-session-1h').evaluate({ userSub: 'u1' })).toBeNull();
  });

  it('portal-session-1h returns a nudge when an upcoming meeting is found', async () => {
    await loadTriggers();
    queueAndReject.push({ rows: [{ id: 'm-1' }] });
    const nudge = await getTrigger('portal-session-1h').evaluate({ userSub: 'u1' });
    expect((nudge as { headline: string }).headline).toBe('Termin in einer Stunde');
  });

  it('portal-new-coach-message pluralizes the count correctly', async () => {
    await loadTriggers();
    queueAndReject.push({ rows: [{ count: '1' }] });
    const one = await getTrigger('portal-new-coach-message').evaluate({ userSub: 'u1' });
    expect((one as { headline: string }).headline).toMatch(/1 neue Nachricht\b/);

    queueAndReject.push({ rows: [{ count: '3' }] });
    const many = await getTrigger('portal-new-coach-message').evaluate({ userSub: 'u1' });
    expect((many as { headline: string }).headline).toMatch(/3 neue Nachrichten/);
  });

  it('portal-fragebogen-open builds a nudge from a row', async () => {
    await loadTriggers();
    queueAndReject.push({ rows: [{ id: 'q-1', title: 'Pre-Session' }] });
    const nudge = await getTrigger('portal-fragebogen-open').evaluate({ userSub: 'u1' });
    expect((nudge as { body: string }).body).toContain('Pre-Session');
  });

  it('portal-fragebogen-open uses a generic "Fragebogen" fallback when title is null', async () => {
    await loadTriggers();
    queueAndReject.push({ rows: [{ id: 'q-1', title: null }] });
    const nudge = await getTrigger('portal-fragebogen-open').evaluate({ userSub: 'u1' });
    expect((nudge as { body: string }).body).toContain('Fragebogen');
  });

  it('returns null and warns once when a table is missing (42P01)', async () => {
    await loadTriggers();
    queueAndReject.setReject({ code: '42P01', message: 'relation not found' });
    vi.clearAllMocks();
    try {
      const out = await getTrigger('portal-signature-pending').evaluate({ userSub: 'u1' });
      expect(out).toBeNull();
      expect(loggerModule.logger.warn).toHaveBeenCalledTimes(1);
    } finally {
      vi.clearAllMocks();
    }
  });
});
