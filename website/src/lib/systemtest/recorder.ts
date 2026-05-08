// Frontend rrweb recorder for system-test runs.
//
// Boots an rrweb DOM recorder on the current page and ships chunks of events
// (plus console + network logs) to /api/admin/evidence/upload every 30s, and
// once more on finalize / pagehide / beforeunload. Bounded buffer to keep the
// browser tab from OOMing on long-running tests; if we drop events we mark the
// evidence row partial so the admin replay UI can flag it.
//
// CLIENT-ONLY: imports `rrweb` (which uses MutationObserver + DOM APIs) and
// touches `window`/`navigator`. Do not import this from server-side code.

import { record } from 'rrweb';

const FLUSH_MS = 30_000;
const MAX_BUFFER = 10 * 1024 * 1024; // 10 MiB of JSON-encoded event text
const MAX_NETWORK_LOG = 20;

export interface RecorderHandle {
  finalize(): Promise<{ evidenceId: string | null; partial: boolean }>;
  cancel(): void;
}

export interface RecorderOpts {
  assignmentId: string;
  questionId: string;
  attempt: number;
}

interface ConsoleEntry {
  level: 'error' | 'warn';
  args: string[];
  at: number;
}

interface NetworkEntry {
  url: string;
  status?: number;
  error?: string;
  ms: number;
}

export function startRecorder(opts: RecorderOpts): RecorderHandle {
  const events: unknown[] = [];
  const consoleLog: ConsoleEntry[] = [];
  const networkLog: NetworkEntry[] = [];
  let chunkIndex = 0;
  let evidenceId: string | null = null;
  let partial = false;
  let bufferBytes = 0;

  const stop = record({
    emit(event) {
      events.push(event);
      bufferBytes += JSON.stringify(event).length;
      if (bufferBytes > MAX_BUFFER) {
        // Drop the oldest 25% of buffered events. Cheaper than a precise byte
        // walk and keeps the buffer bounded between flushes.
        const drop = Math.max(1, Math.floor(events.length * 0.25));
        events.splice(0, drop);
        bufferBytes = events.reduce<number>((s, e) => s + JSON.stringify(e).length, 0);
        partial = true;
      }
    },
  });

  // Capture console.error / console.warn for context in the evidence row.
  const consolePatched: Record<'error' | 'warn', typeof console.error> = {
    error: console.error,
    warn: console.warn,
  };
  for (const lvl of ['error', 'warn'] as const) {
    const orig = consolePatched[lvl];
    console[lvl] = (...args: unknown[]) => {
      consoleLog.push({ level: lvl, args: args.map((a) => String(a)), at: Date.now() });
      orig.apply(console, args as []);
    };
  }

  // Capture fetch URLs / status / latency. Bounded to MAX_NETWORK_LOG most
  // recent calls — enough to debug a flaky test without blowing up the row.
  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const t0 = Date.now();
    try {
      const res = await origFetch(...args);
      networkLog.push({ url: String(args[0]), status: res.status, ms: Date.now() - t0 });
      while (networkLog.length > MAX_NETWORK_LOG) networkLog.shift();
      return res;
    } catch (e) {
      networkLog.push({ url: String(args[0]), error: String(e), ms: Date.now() - t0 });
      while (networkLog.length > MAX_NETWORK_LOG) networkLog.shift();
      throw e;
    }
  };

  async function flush(isFinal: boolean): Promise<void> {
    if (events.length === 0 && !isFinal) return;
    const drained = events.splice(0);
    bufferBytes = 0;
    const chunk = { events: drained, chunkIndex: chunkIndex++, isFinal };
    const body = JSON.stringify({
      assignmentId: opts.assignmentId,
      questionId: opts.questionId,
      attempt: opts.attempt,
      chunk,
      consoleLog,
      networkLog,
    });
    const delays = [5_000, 15_000, 45_000];
    for (let attemptN = 0; ; attemptN++) {
      try {
        const res = await fetch('/api/admin/evidence/upload', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        evidenceId = json.evidenceId ?? evidenceId;
        return;
      } catch {
        if (attemptN >= delays.length) {
          // Give up — push events back so a later flush retries.
          partial = true;
          events.unshift(...drained);
          return;
        }
        await new Promise((r) => setTimeout(r, delays[attemptN]));
      }
    }
  }

  const interval = setInterval(() => {
    void flush(false);
  }, FLUSH_MS);

  // Best-effort flush on pagehide/unload via sendBeacon (sync, won't await).
  const handlePageHide = (): void => {
    if (events.length === 0) return;
    const drained = events.splice(0);
    const blob = new Blob(
      [
        JSON.stringify({
          assignmentId: opts.assignmentId,
          questionId: opts.questionId,
          attempt: opts.attempt,
          chunk: { events: drained, chunkIndex: chunkIndex++, isFinal: true },
          consoleLog,
          networkLog,
        }),
      ],
      { type: 'application/json' },
    );
    navigator.sendBeacon('/api/admin/evidence/upload', blob);
  };
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('beforeunload', handlePageHide);

  return {
    async finalize() {
      clearInterval(interval);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      stop?.();
      await flush(true);
      return { evidenceId, partial };
    },
    cancel() {
      clearInterval(interval);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      stop?.();
    },
  };
}
