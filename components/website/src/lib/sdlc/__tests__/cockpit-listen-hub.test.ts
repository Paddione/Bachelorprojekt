import { describe, it, expect, vi } from 'vitest';
import type { CockpitEvent } from '../cockpit-listen-hub';

const { mockOnFns, mockClient } = vi.hoisted(() => {
  const fns: Record<string, (...args: unknown[]) => void> = {};
  const client = {
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    query: vi.fn<(_: string) => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] }),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      fns[event] = fn;
    }),
    removeAllListeners: vi.fn(),
    end: vi.fn(),
  };
  return { mockOnFns: fns, mockClient: client };
});

vi.mock('pg', () => ({
  Client: vi.fn(function MockClientCtor() { return mockClient; }),
}));

vi.mock('../../db-pool', () => ({
  pool: {
    options: {
      connectionString: 'postgresql://test:test@localhost:5432/test',
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 30000,
      statement_timeout: 2000,
    },
  },
}));

const modPromise = import('../cockpit-listen-hub');

// vi.waitFor resolves immediately even when the condition is false in this
// environment (observed 2026-08-08) — poll with real timers instead.
async function pollUntil(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`pollUntil timed out after ${timeoutMs}ms`);
}

describe('cockpit-listen-hub (Task 4)', () => {
  it('full lifecycle: subscribe, shared connection, notification, malformed payload', async () => {
    const mod = await modPromise;

    // Starts empty
    expect(mod.subscriberCount()).toBe(0);

    // Subscribe two — triggers connect
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    mod.subscribe(fn1);
    mod.subscribe(fn2);
    expect(mod.subscriberCount()).toBe(2);

    // Wait for async connect to complete: the connect() call happens first, but
    // the on() handler registrations only run AFTER its awaits settle. Waiting
    // on connect alone races those continuations, so wait on the on() handlers.
    await pollUntil(() => mockClient.on.mock.calls.length >= 3);

    // Exactly one connect (shared connection)
    expect(mockClient.connect).toHaveBeenCalledTimes(1);

    // LISTEN issued
    expect(mockClient.query).toHaveBeenCalledWith('LISTEN cockpit_events');

    // on() handlers registered
    const onCalls = mockClient.on.mock.calls;
    expect(onCalls.length).toBeGreaterThanOrEqual(3);
    expect(onCalls.some(([event]) => event === 'notification')).toBe(true);
    expect(onCalls.some(([event]) => event === 'error')).toBe(true);
    expect(onCalls.some(([event]) => event === 'end')).toBe(true);

    // Notification listener available via mockOnFns
    const notifFn = mockOnFns['notification'];
    expect(notifFn).toBeTypeOf('function');

    // Deliver a notification — both subscribers get it
    const payload: CockpitEvent = { domain: 'factory', op: 'INSERT', at: 1234567890 };
    notifFn({ payload: JSON.stringify(payload) });
    expect(fn1).toHaveBeenCalledWith(payload);
    expect(fn2).toHaveBeenCalledWith(payload);

    // Malformed payload is swallowed
    fn1.mockClear();
    fn2.mockClear();
    notifFn({ payload: '{not valid json' });
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });
});
