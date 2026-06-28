// Captures client-side errors into the central log bus. Registered once per page
// (admin sessions only) so the logging widget shows browser failures alongside
// server and pod logs. The event target is injectable for unit testing.

import type { LogEntry, LogLevel } from './log-types';

type EventTargetLike = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

interface CaptureOptions {
  /** Also wrap console error / warn methods. Off by default (console can be noisy). */
  captureConsole?: boolean;
  /** Injectable for tests; defaults to `window`. */
  target?: EventTargetLike;
}

let registered = false;

function makeEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  return { ts: Date.now(), level, source: 'browser', message, meta };
}

function stringifyArg(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.message;
  try { return JSON.stringify(a); } catch { return String(a); }
}

/**
 * Register global browser error capture. Idempotent: a second call while already
 * registered is a no-op. Returns a disposer that unregisters everything.
 */
export function registerBrowserLogCapture(
  add: (e: LogEntry) => void,
  opts: CaptureOptions = {},
): () => void {
  const target = opts.target ?? (typeof window !== 'undefined' ? (window as EventTargetLike) : undefined);
  if (registered || !target) return () => {};
  registered = true;

  const onError = (ev: Event) => {
    const e = ev as ErrorEvent;
    add(makeEntry('error', e.message || String(e.error ?? 'Unknown error'), {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error instanceof Error ? e.error.stack : undefined,
    }));
  };

  const onRejection = (ev: Event) => {
    const reason = (ev as PromiseRejectionEvent).reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    add(makeEntry('error', `Unhandled rejection: ${message}`, {
      stack: reason instanceof Error ? reason.stack : undefined,
    }));
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);

  const restorers: Array<() => void> = [];
  if (opts.captureConsole && typeof console !== 'undefined') {
    const wrap = (method: 'error' | 'warn', level: LogLevel) => {
      const orig = console[method].bind(console);
      console[method] = (...args: unknown[]) => {
        add(makeEntry(level, args.map(stringifyArg).join(' ')));
        orig(...args);
      };
      restorers.push(() => { console[method] = orig; });
    };
    wrap('error', 'error');
    wrap('warn', 'warn');
  }

  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
    for (const restore of restorers) restore();
    registered = false;
  };
}
