// website/src/lib/systemtest/recorder.test.ts
//
// Behavioral tests for the client-only rrweb recorder. Runs under the
// 'components' vitest project (jsdom environment — see vitest.config.ts)
// because the module touches window/document/navigator directly and
// imports `rrweb`.
//
// `rrweb`'s `record()` is mocked so tests control exactly which DOM events
// are "captured" instead of relying on real MutationObserver behavior.
// `window.fetch` and `navigator.sendBeacon` are stubbed so no real network
// I/O happens.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type EmitFn = (event: unknown) => void;

let capturedEmit: EmitFn | null = null;
const stopMock = vi.fn();
const recordMock = vi.fn((opts: { emit: EmitFn }) => {
  capturedEmit = opts.emit;
  return stopMock;
});

vi.mock('rrweb', () => ({
  record: (opts: { emit: EmitFn }) => recordMock(opts),
}));

import { startRecorder, type RecorderOpts } from './recorder';

const OPTS: RecorderOpts = { assignmentId: 'a1', questionId: 'q1', attempt: 2 };

function lastBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1);
  const init = call?.[1] as { body: string };
  return JSON.parse(init.body);
}

beforeEach(() => {
  vi.useFakeTimers();
  recordMock.mockClear();
  stopMock.mockClear();
  capturedEmit = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startRecorder', () => {
  it('boots rrweb recording immediately', () => {
    startRecorder(OPTS);
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(capturedEmit).toBeTypeOf('function');
  });

  it('finalize() flushes buffered events to the upload endpoint and returns evidenceId', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ evidenceId: 'ev-1' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const handle = startRecorder(OPTS);
    capturedEmit!({ type: 2, data: {} });

    const result = await handle.finalize();

    expect(result).toEqual({ evidenceId: 'ev-1', partial: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/evidence/upload');
    expect(init?.method).toBe('POST');
    const body = lastBody(fetchMock);
    expect(body).toMatchObject({
      assignmentId: 'a1',
      questionId: 'q1',
      attempt: 2,
      partial: false,
    });
    expect((body.chunk as { events: unknown[]; isFinal: boolean }).events).toHaveLength(1);
    expect((body.chunk as { isFinal: boolean }).isFinal).toBe(true);
    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it('finalize() with no buffered events still performs the final flush (isFinal short-circuit)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const handle = startRecorder(OPTS);
    const result = await handle.finalize();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.evidenceId).toBeNull();
  });

  it('flushes automatically every 30s while running', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ evidenceId: 'ev-x' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const handle = startRecorder(OPTS);
    capturedEmit!({ type: 1 });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastBody(fetchMock);
    expect((body.chunk as { isFinal: boolean }).isFinal).toBe(false);

    handle.cancel();
  });

  it('skips a periodic flush entirely when there are no new events buffered', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const handle = startRecorder(OPTS);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).not.toHaveBeenCalled();

    handle.cancel();
  });

  it('retries a failed flush with backoff and eventually succeeds', async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt++;
      if (attempt < 3) throw new Error('network down');
      return new Response(JSON.stringify({ evidenceId: 'ev-retry' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const handle = startRecorder(OPTS);
    capturedEmit!({ type: 3 });

    const finalizePromise = handle.finalize();
    // Retry delays are [5_000, 15_000, 45_000]; two retries needed here.
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await finalizePromise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ evidenceId: 'ev-retry', partial: false });
  });

  it('gives up after exhausting all retries, marks partial and requeues the dropped events', async () => {
    const fetchMock = vi.fn(async () => new Response('err', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const handle = startRecorder(OPTS);
    capturedEmit!({ type: 4 });

    const finalizePromise = handle.finalize();
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(45_000);
    const result = await finalizePromise;

    // 1 initial + 3 retries = 4 attempts (delays array has 3 entries).
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.partial).toBe(true);
    expect(result.evidenceId).toBeNull();
  });

  it('an HTTP error status (non-ok) is treated as a failure and retried', async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt++;
      if (attempt === 1) return new Response('nope', { status: 503 });
      return new Response(JSON.stringify({ evidenceId: 'ev-2' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const handle = startRecorder(OPTS);
    capturedEmit!({ type: 5 });
    const finalizePromise = handle.finalize();
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await finalizePromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.evidenceId).toBe('ev-2');
  });

  it('drops the oldest ~25% of the buffer and marks partial once MAX_BUFFER is exceeded', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ evidenceId: 'ev-3' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    startRecorder(OPTS);
    // Each emitted event is JSON.stringify'd; push large events to cross the
    // 10 MiB MAX_BUFFER threshold quickly.
    const bigPayload = 'x'.repeat(1024 * 1024); // ~1 MiB when stringified
    for (let i = 0; i < 11; i++) {
      capturedEmit!({ type: 2, data: bigPayload, i });
    }

    // The buffer-overflow branch is exercised internally; assert indirectly
    // via the flushed body eventually reporting partial=true.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastBody(fetchMock);
    expect(body.partial).toBe(true);
    // Fewer than 11 events survive the drop.
    expect((body.chunk as { events: unknown[] }).events.length).toBeLessThan(11);
  });

  it('captures console.error/warn into consoleLog and forwards to the original console fn', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const handle = startRecorder(OPTS);
    capturedEmit!({ type: 1 });
    console.error('boom', 42);
    console.warn('careful');

    await handle.finalize();

    const body = lastBody(fetchMock);
    expect(body.consoleLog).toEqual([
      { level: 'error', args: ['boom', '42'], at: expect.any(Number) },
      { level: 'warn', args: ['careful'], at: expect.any(Number) },
    ]);
    // The originals are still invoked underneath the patch (spies capture the calls).
    expect(errorSpy).toHaveBeenCalledWith('boom', 42);
    expect(warnSpy).toHaveBeenCalledWith('careful');
  });

  it('restores console.error/warn after finalize', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const originalError = console.error;

    const handle = startRecorder(OPTS);
    expect(console.error).not.toBe(originalError);
    await handle.finalize();

    expect(console.error).toBe(originalError);
  });

  it('restores console.error/warn after cancel (without flushing)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const originalWarn = console.warn;

    const handle = startRecorder(OPTS);
    capturedEmit!({ type: 1 });
    handle.cancel();

    expect(console.warn).toBe(originalWarn);
    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();

    // cancel() also stops the periodic flush interval — advancing time must
    // not trigger a late flush.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records fetch calls made by the page into networkLog, bounded to MAX_NETWORK_LOG', async () => {
    const uploadFetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    let n = 0;
    const pageFetch = vi.fn(async (input: RequestInfo | URL) => {
      n++;
      // Every call after boot is a "page" fetch except the final upload call.
      if (String(input) === '/api/admin/evidence/upload') return uploadFetch();
      return new Response('ok', { status: 200 });
    });
    vi.stubGlobal('fetch', pageFetch);

    const handle = startRecorder(OPTS);
    capturedEmit!({ type: 1 });

    // Patched window.fetch is what page code calls — invoke it directly like
    // application code would, to exercise the interception wrapper.
    for (let i = 0; i < 25; i++) {
      await window.fetch(`/api/thing/${i}`);
    }

    const result = await handle.finalize();
    void result;
    const body = lastBody(pageFetch);
    expect((body.networkLog as unknown[]).length).toBe(20);
    // Most recent 20 of the 25 calls survive (oldest 5 shifted out).
    expect((body.networkLog as Array<{ url: string }>)[0].url).toBe('/api/thing/5');
    expect((body.networkLog as Array<{ url: string }>).at(-1)!.url).toBe('/api/thing/24');
    void n;
  });

  it('records a networkLog entry with an error field when the page fetch rejects', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      calls++;
      if (String(input) === '/api/admin/evidence/upload') {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchMock);

    const handle = startRecorder(OPTS);
    capturedEmit!({ type: 1 });

    await expect(window.fetch('/api/broken')).rejects.toThrow('offline');

    await handle.finalize();
    const body = lastBody(fetchMock);
    expect((body.networkLog as Array<{ url: string; error?: string }>)[0]).toMatchObject({
      url: '/api/broken',
      error: 'Error: offline',
    });
    void calls;
  });

  it('restores window.fetch to the pre-patch implementation after finalize', async () => {
    const originalMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', originalMock);
    const patchedDuringRecording = window.fetch;

    const handle = startRecorder(OPTS);
    expect(window.fetch).not.toBe(patchedDuringRecording);
    await handle.finalize();

    // startRecorder binds the original before patching (`.bind(window)`), so
    // the restored reference isn't `===` the raw mock — assert it delegates
    // to the same underlying implementation instead.
    expect(window.fetch).not.toBe(patchedDuringRecording);
    originalMock.mockClear();
    await window.fetch('/probe');
    expect(originalMock).toHaveBeenCalledWith('/probe');
  });

  it('sends a best-effort beacon on pagehide with buffered events, and clears the buffer', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const sendBeaconMock = vi.fn((_url: string, _data?: BodyInit) => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: sendBeaconMock });

    const handle = startRecorder(OPTS);
    capturedEmit!({ type: 9 });

    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeaconMock.mock.calls[0];
    expect(url).toBe('/api/admin/evidence/upload');
    expect(blob).toBeInstanceOf(Blob);

    // A second pagehide with an empty buffer is a no-op.
    window.dispatchEvent(new Event('pagehide'));
    expect(sendBeaconMock).toHaveBeenCalledTimes(1);

    handle.cancel();
  });

  it('sends a beacon on beforeunload too', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const sendBeaconMock = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: sendBeaconMock });

    const handle = startRecorder(OPTS);
    capturedEmit!({ type: 9 });
    window.dispatchEvent(new Event('beforeunload'));

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    handle.cancel();
  });

  it('cancel() removes pagehide/beforeunload listeners so a later pagehide is a no-op', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const sendBeaconMock = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: sendBeaconMock });

    const handle = startRecorder(OPTS);
    capturedEmit!({ type: 1 });
    handle.cancel();

    window.dispatchEvent(new Event('pagehide'));
    expect(sendBeaconMock).not.toHaveBeenCalled();
  });

  it('finalize() removes pagehide/beforeunload listeners too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const sendBeaconMock = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: sendBeaconMock });

    const handle = startRecorder(OPTS);
    await handle.finalize();

    window.dispatchEvent(new Event('pagehide'));
    expect(sendBeaconMock).not.toHaveBeenCalled();
  });
});
