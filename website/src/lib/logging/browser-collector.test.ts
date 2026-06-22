import { describe, it, expect } from 'vitest';
import { registerBrowserLogCapture } from './browser-collector';
import type { LogEntry } from './log-types';

/** Minimal EventTarget stub that lets the test invoke registered handlers. */
function fakeTarget() {
  const handlers: Record<string, ((ev: unknown) => void) | undefined> = {};
  return {
    handlers,
    addEventListener: (type: string, fn: (ev: unknown) => void) => { handlers[type] = fn; },
    removeEventListener: (type: string) => { delete handlers[type]; },
  };
}

describe('registerBrowserLogCapture', () => {
  it('captures window error events as browser error entries', () => {
    const added: LogEntry[] = [];
    const target = fakeTarget();
    const dispose = registerBrowserLogCapture((e) => added.push(e), { target });

    target.handlers.error?.({ message: 'boom', filename: 'a.js', lineno: 3, colno: 7, error: new Error('boom') });

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ level: 'error', source: 'browser', message: 'boom' });
    expect(added[0].meta).toMatchObject({ filename: 'a.js', lineno: 3, colno: 7 });
    dispose();
  });

  it('captures unhandled promise rejections', () => {
    const added: LogEntry[] = [];
    const target = fakeTarget();
    const dispose = registerBrowserLogCapture((e) => added.push(e), { target });

    target.handlers.unhandledrejection?.({ reason: new Error('nope') });

    expect(added[0]).toMatchObject({ level: 'error', source: 'browser' });
    expect(added[0].message).toContain('nope');
    dispose();
  });

  it('is idempotent while registered and re-registerable after dispose', () => {
    const added: LogEntry[] = [];
    const t1 = fakeTarget();
    const dispose = registerBrowserLogCapture((e) => added.push(e), { target: t1 });

    // Second call while active is a no-op (no handlers on a fresh target).
    const t2 = fakeTarget();
    registerBrowserLogCapture((e) => added.push(e), { target: t2 });
    expect(t2.handlers.error).toBeUndefined();

    dispose();
    expect(t1.handlers.error).toBeUndefined(); // disposed → unregistered

    // After dispose we can register again.
    const t3 = fakeTarget();
    const dispose3 = registerBrowserLogCapture((e) => added.push(e), { target: t3 });
    expect(t3.handlers.error).toBeTypeOf('function');
    dispose3();
  });
});
