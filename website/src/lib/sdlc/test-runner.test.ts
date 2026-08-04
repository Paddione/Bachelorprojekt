// website/src/lib/test-runner.test.ts
//
// Behavioral tests for spawnTestRun's job orchestration: process spawning,
// stdout line streaming, JSONL result tailing, and the exit handler that
// persists the run + per-test results and auto-files failure tickets.
//
// Everything that touches the real world (child_process, fs, fs/promises,
// readline, the DB layer, the failure-bridge) is mocked — no real
// subprocess/filesystem/DB access happens here.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ── Module mocks ─────────────────────────────────────────────────────────
// Specifiers below are relative to THIS file, which lives next to
// test-runner.ts, so they resolve to the same modules the SUT imports.

const spawnMock = vi.fn();
vi.mock('child_process', () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));

const createInterfaceMock = vi.fn();
vi.mock('readline', () => ({ createInterface: (...args: unknown[]) => createInterfaceMock(...args) }));

const watchMock = vi.fn();
const existsSyncMock = vi.fn();
const readdirSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
vi.mock('fs', () => ({
  watch: (...args: unknown[]) => watchMock(...args),
  existsSync: (...args: unknown[]) => existsSyncMock(...args),
  readdirSync: (...args: unknown[]) => readdirSyncMock(...args),
  mkdirSync: (...args: unknown[]) => mkdirSyncMock(...args),
}));

const readFileMock = vi.fn();
vi.mock('fs/promises', () => ({ readFile: (...args: unknown[]) => readFileMock(...args) }));

const saveTestRunMock = vi.fn();
const saveTestResultsMock = vi.fn();
const updateTestRunMock = vi.fn();
vi.mock('./website-db.js', () => ({
  saveTestRun: (...args: unknown[]) => saveTestRunMock(...args),
  saveTestResults: (...args: unknown[]) => saveTestResultsMock(...args),
  updateTestRun: (...args: unknown[]) => updateTestRunMock(...args),
  pool: { marker: 'pool' },
}));

const safeOpenTestRunFailureTicketMock = vi.fn();
vi.mock('./systemtest/test-run-bridge.js', () => ({
  safeOpenTestRunFailureTicket: (...args: unknown[]) => safeOpenTestRunFailureTicketMock(...args),
}));

const loggerErrorMock = vi.fn();
vi.mock('./logger', () => ({
  logger: { error: (...args: unknown[]) => loggerErrorMock(...args) },
}));

import { spawnTestRun, getJob, hasRunningJob } from './test-runner';

// ── Test helpers ─────────────────────────────────────────────────────────

type FakeProc = EventEmitter & { stdout: unknown; stderr: { resume: ReturnType<typeof vi.fn> } };

function makeFakeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.stdout = {};
  proc.stderr = { resume: vi.fn() };
  return proc;
}

let currentProc: FakeProc;
let currentRl: EventEmitter;
/** Registered fs.watch(path, listener) calls, in registration order. */
let watchers: Array<{ path: string; listener: (...args: unknown[]) => void; close: ReturnType<typeof vi.fn> }>;

function setupDefaultMocks(): void {
  currentProc = makeFakeProc();
  spawnMock.mockReturnValue(currentProc);

  currentRl = new EventEmitter();
  createInterfaceMock.mockReturnValue(currentRl);

  watchers = [];
  watchMock.mockImplementation((path: string, listener: (...args: unknown[]) => void) => {
    const close = vi.fn();
    watchers.push({ path, listener, close });
    return { close };
  });

  existsSyncMock.mockReturnValue(false);
  readdirSyncMock.mockReturnValue([]);
  mkdirSyncMock.mockReturnValue(undefined);
  readFileMock.mockRejectedValue(new Error('ENOENT'));

  saveTestRunMock.mockResolvedValue(undefined);
  saveTestResultsMock.mockResolvedValue([]);
  updateTestRunMock.mockResolvedValue(undefined);
  safeOpenTestRunFailureTicketMock.mockResolvedValue(undefined);
}

/** Emit 'exit' on the current fake proc and wait until the job leaves 'running'. */
async function exitAndSettle(id: string, code: number): Promise<void> {
  currentProc.emit('exit', code);
  await vi.waitFor(() => {
    const job = getJob(id);
    if (!job || job.status === 'running') throw new Error('still running');
  }, { timeout: 2000, interval: 5 });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('getJob / hasRunningJob', () => {
  it('returns undefined for an unknown job id', () => {
    expect(getJob('does-not-exist')).toBeUndefined();
  });

  it('reports no running job when the registry is empty of running jobs', async () => {
    const id = await spawnTestRun('FA', []);
    await exitAndSettle(id, 0);
    expect(hasRunningJob()).toBe(false);
  });

  it('reports a running job while a spawn is in-flight', async () => {
    await spawnTestRun('FA', []);
    expect(hasRunningJob()).toBe(true);
  });
});

describe('spawnTestRun — process bootstrap', () => {
  it('spawns bash tests/runner.sh with tier + testIds and cwd=/app', async () => {
    await spawnTestRun('FA', ['FA-1', 'FA-2']);
    expect(spawnMock).toHaveBeenCalledWith(
      'bash',
      ['tests/runner.sh', 'FA', 'FA-1', 'FA-2'],
      expect.objectContaining({ cwd: '/app' }),
    );
  });

  it('saves the initial test run with testIds joined by space', async () => {
    const id = await spawnTestRun('FA', ['FA-1', 'FA-2']);
    expect(saveTestRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ id, tier: 'FA', testIds: 'FA-1 FA-2', cluster: 'dev' }),
    );
  });

  it('saves testIds as null when no test ids are given', async () => {
    await spawnTestRun('SA', []);
    expect(saveTestRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ testIds: null }),
    );
  });

  it('consumes stderr to avoid pipe backpressure', async () => {
    await spawnTestRun('FA', []);
    expect(currentProc.stderr.resume).toHaveBeenCalled();
  });

  it('ensures the results dir exists via mkdirSync', async () => {
    await spawnTestRun('FA', []);
    expect(mkdirSyncMock).toHaveBeenCalledWith('/app/tests/results', { recursive: true });
  });

  it('registers a directory watcher on the results dir', async () => {
    await spawnTestRun('FA', []);
    expect(watchers.some((w) => w.path === '/app/tests/results')).toBe(true);
  });
});

describe('spawnTestRun — stdout line streaming', () => {
  it('buffers stdout lines and emits log events to listeners', async () => {
    const id = await spawnTestRun('FA', []);
    const job = getJob(id)!;
    const events: Array<{ event: string; data: string }> = [];
    job.listeners.add((event, data) => events.push({ event, data }));

    currentRl.emit('line', 'hello world');

    expect(job.stdoutBuffer).toEqual(['hello world']);
    expect(events).toContainEqual({ event: 'log', data: JSON.stringify({ line: 'hello world' }) });
  });
});

describe('spawnTestRun — JSONL result tailing', () => {
  it('tails a pre-existing jsonl file found at start and emits parsed results', async () => {
    existsSyncMock.mockImplementation((p: string) => p === '/app/tests/results');
    readdirSyncMock.mockImplementation((p: string) => {
      if (p === '/app/tests/results') return ['.tmp-FA-1000.jsonl', '.tmp-FA-2000.jsonl'];
      return [];
    });
    readFileMock.mockImplementation(async (p: string) => {
      if (p === '/app/tests/results/.tmp-FA-2000.jsonl') {
        return [
          JSON.stringify({ req: 'FA-1', test: 'happy', desc: 'd', status: 'pass', duration_ms: 5, detail: '' }),
          'not json',
          JSON.stringify({ req: 'FA-2', desc: 'no status field' }), // missing status → ignored
          '',
        ].join('\n');
      }
      throw new Error('unexpected path ' + p);
    });

    const id = await spawnTestRun('FA', []);
    const job = getJob(id)!;

    // startJsonlTail's readNewLines() runs fire-and-forget (it may already have
    // resolved by the time spawnTestRun's own awaits settle); wait for it.
    await vi.waitFor(() => {
      if (job.resultBuffer.length === 0) throw new Error('not yet');
    });

    expect(job.resultBuffer).toHaveLength(1);
    expect(job.resultBuffer[0]).toMatchObject({ req: 'FA-1', test: 'happy', status: 'pass' });
    // Picks the lexicographically-latest (most recent) of the two candidate files.
    expect(readFileMock).toHaveBeenCalledWith('/app/tests/results/.tmp-FA-2000.jsonl', 'utf-8');
  });

  it('starts tailing when the directory watcher reports a matching new file', async () => {
    readFileMock.mockResolvedValue('');
    const id = await spawnTestRun('FA', []);
    const dirWatcher = watchers.find((w) => w.path === '/app/tests/results')!;

    dirWatcher.listener('rename', '.tmp-FA-3000.jsonl');
    await vi.waitFor(() => {
      if (readFileMock.mock.calls.length === 0) throw new Error('not yet called');
    });
    expect(readFileMock).toHaveBeenCalledWith('/app/tests/results/.tmp-FA-3000.jsonl', 'utf-8');

    // A second event for the SAME file must not re-register a watcher / re-tail.
    const callsBefore = readFileMock.mock.calls.length;
    dirWatcher.listener('rename', '.tmp-FA-3000.jsonl');
    // Give any errant async work a chance to run, then assert no new call happened.
    await new Promise((r) => setTimeout(r, 10));
    expect(readFileMock.mock.calls.length).toBe(callsBefore);
    void id;
  });

  it('ignores directory events for unrelated filenames', async () => {
    const id = await spawnTestRun('FA', []);
    const dirWatcher = watchers.find((w) => w.path === '/app/tests/results')!;
    dirWatcher.listener('rename', 'unrelated.txt');
    await new Promise((r) => setTimeout(r, 10));
    expect(readFileMock).not.toHaveBeenCalled();
    void id;
  });

  it('silently ignores a read failure while tailing (file not ready yet)', async () => {
    existsSyncMock.mockImplementation((p: string) => p === '/app/tests/results');
    readdirSyncMock.mockImplementation((p: string) =>
      p === '/app/tests/results' ? ['.tmp-FA-1000.jsonl'] : [],
    );
    readFileMock.mockRejectedValue(new Error('ENOENT'));

    const id = await spawnTestRun('FA', []);
    await exitAndSettle(id, 0);
    const job = getJob(id)!;
    expect(job.resultBuffer).toEqual([]);
  });
});

describe('spawnTestRun — exit handler: finalized summary + results file', () => {
  it('falls back to zeroed summary and status=done when no result files exist', async () => {
    const id = await spawnTestRun('FA', []);
    await exitAndSettle(id, 0);
    const job = getJob(id)!;
    expect(job.status).toBe('done');
    expect(job.summary).toEqual({ total: 0, pass: 0, fail: 0, skip: 0 });
    expect(updateTestRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ id, status: 'done', pass: 0, fail: 0, skip: 0 }),
    );
    expect(saveTestResultsMock).not.toHaveBeenCalled();
  });

  it('marks the job as error when the process exits non-zero', async () => {
    const id = await spawnTestRun('FA', []);
    await exitAndSettle(id, 1);
    expect(getJob(id)!.status).toBe('error');
  });

  it('reads the finalized JSON summary+results file, ignoring .tmp and non-matching files', async () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue([
      '.tmp-FA-9999.jsonl',
      '2026-06-01T00-00-00-FA.json',
      '2026-06-30T00-00-00-FA.json', // latest by sort()
      '2026-06-15T00-00-00-SA.json', // wrong tier suffix
    ]);
    readFileMock.mockImplementation(async (p: string) => {
      if (p === '/app/tests/results/2026-06-30T00-00-00-FA.json') {
        return JSON.stringify({
          summary: { total: 3, pass: 1, fail: 2, skip: 0 },
          results: [
            { test_id: 'FA-1/happy', req: 'FA-1', test: 'happy', category: 'FA', status: 'pass', duration_ms: 10, message: 'ok' },
            { req: 'SA-2', category: 'SA', status: 'fail', duration_ms: 20, detail: 'boom' },
            { req: 'NFA-3', category: 'ZZZ', status: 'fail', message: 'oops' },
            { req: 'FA-4', category: 'FA', status: 'weird-status', message: 'filtered out' },
          ],
        });
      }
      throw new Error('unexpected read of ' + p);
    });
    saveTestResultsMock.mockResolvedValue([
      { id: 101, testId: 'FA-1/happy', category: 'FA', status: 'pass', durationMs: 10, message: 'ok' },
      { id: 102, testId: 'SA-2', category: 'SA', status: 'fail', durationMs: 20, message: 'boom' },
      { id: 103, testId: 'NFA-3', category: 'FA', status: 'fail', durationMs: null, message: 'oops' },
    ]);

    const id = await spawnTestRun('FA', []);
    await exitAndSettle(id, 0);
    const job = getJob(id)!;
    expect(job.summary).toEqual({ total: 3, pass: 1, fail: 2, skip: 0 });

    // saveTestResults receives the 3 status-allowed rows (the 'weird-status' one filtered out),
    // with fallback testId, category defaulted to 'FA' for the invalid one, and
    // message falling back to `detail` when message is absent.
    expect(saveTestResultsMock).toHaveBeenCalledWith(id, [
      { testId: 'FA-1/happy', category: 'FA', status: 'pass', durationMs: 10, message: 'ok' },
      { testId: 'SA-2', category: 'SA', status: 'fail', durationMs: 20, message: 'boom' },
      { testId: 'NFA-3', category: 'FA', status: 'fail', durationMs: undefined, message: 'oops' },
    ]);

    // Only fail rows get auto-ticketed, keyed by (testId|status|message) to
    // recover the precise inserted result_id.
    expect(safeOpenTestRunFailureTicketMock).toHaveBeenCalledTimes(2);
    expect(safeOpenTestRunFailureTicketMock).toHaveBeenCalledWith(
      { marker: 'pool' },
      expect.objectContaining({
        runId: id, resultId: 102, testId: 'SA-2', category: 'SA', error: 'boom', source: 'admin', cluster: 'dev',
      }),
    );
    expect(safeOpenTestRunFailureTicketMock).toHaveBeenCalledWith(
      { marker: 'pool' },
      expect.objectContaining({
        runId: id, resultId: 103, testId: 'NFA-3', category: 'FA', error: 'oops', source: 'admin', cluster: 'dev',
      }),
    );
  });

  it('falls back to counting job.resultBuffer when the finalized JSON cannot be parsed', async () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue(['2026-06-30T00-00-00-FA.json']);
    readFileMock.mockRejectedValue(new Error('bad json'));

    const id = await spawnTestRun('FA', []);
    currentRl.emit('line', 'irrelevant');
    // Directly seed resultBuffer via a successful jsonl-tail line, simulating
    // results that streamed in before the process exited.
    const job = getJob(id)!;
    job.resultBuffer.push({ req: 'FA-1', test: 'x', desc: '', status: 'pass', duration_ms: 1, detail: '' });
    job.resultBuffer.push({ req: 'FA-2', test: 'y', desc: '', status: 'fail', duration_ms: 1, detail: 'nope' });

    await exitAndSettle(id, 1);
    expect(job.summary).toEqual({ total: 2, pass: 1, fail: 1, skip: 0 });
    // Source falls back to resultBuffer-derived rows too.
    expect(saveTestResultsMock).toHaveBeenCalledWith(id, [
      { testId: 'FA-1/x', category: 'FA', status: 'pass', durationMs: 1, message: '' },
      { testId: 'FA-2/y', category: 'FA', status: 'fail', durationMs: 1, message: 'nope' },
    ]);
  });

  it('does not throw when updateTestRun rejects', async () => {
    updateTestRunMock.mockRejectedValue(new Error('db down'));
    const id = await spawnTestRun('FA', []);
    await exitAndSettle(id, 0);
    expect(getJob(id)!.status).toBe('done');
  });

  it('does not file tickets when saveTestResults rejects', async () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue(['2026-06-30T00-00-00-FA.json']);
    readFileMock.mockImplementation(async (p: string) => {
      if (p === '/app/tests/results/2026-06-30T00-00-00-FA.json') {
        return JSON.stringify({
          summary: { total: 1, pass: 0, fail: 1, skip: 0 },
          results: [{ req: 'FA-1', category: 'FA', status: 'fail', message: 'boom' }],
        });
      }
      throw new Error('unexpected read');
    });
    saveTestResultsMock.mockRejectedValue(new Error('db down'));

    const id = await spawnTestRun('FA', []);
    await exitAndSettle(id, 0);
    expect(safeOpenTestRunFailureTicketMock).not.toHaveBeenCalled();
  });

  it('logs via logger.error when safeOpenTestRunFailureTicket rejects', async () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue(['2026-06-30T00-00-00-FA.json']);
    readFileMock.mockImplementation(async (p: string) => {
      if (p === '/app/tests/results/2026-06-30T00-00-00-FA.json') {
        return JSON.stringify({
          summary: { total: 1, pass: 0, fail: 1, skip: 0 },
          results: [{ req: 'FA-1', category: 'FA', status: 'fail', message: 'boom' }],
        });
      }
      throw new Error('unexpected read');
    });
    saveTestResultsMock.mockResolvedValue([
      { id: 55, testId: 'FA-1', category: 'FA', status: 'fail', durationMs: null, message: 'boom' },
    ]);
    safeOpenTestRunFailureTicketMock.mockRejectedValue(new Error('ticket api down'));

    const id = await spawnTestRun('FA', []);
    await exitAndSettle(id, 0);
    await vi.waitFor(() => {
      if (loggerErrorMock.mock.calls.length === 0) throw new Error('not yet');
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('safeOpenTestRunFailureTicket failed'),
    );
  });

  it('emits a done event with code, summary and duration', async () => {
    const id = await spawnTestRun('FA', []);
    const job = getJob(id)!;
    const events: Array<{ event: string; data: string }> = [];
    job.listeners.add((event, data) => events.push({ event, data }));

    await exitAndSettle(id, 0);

    const doneEvent = events.find((e) => e.event === 'done');
    expect(doneEvent).toBeDefined();
    const payload = JSON.parse(doneEvent!.data) as { code: number; summary: unknown; durationMs: number };
    expect(payload.code).toBe(0);
    expect(payload.summary).toEqual({ total: 0, pass: 0, fail: 0, skip: 0 });
    expect(typeof payload.durationMs).toBe('number');
  });

  it('keeps the job in the registry immediately after exit for late SSE consumers', async () => {
    const id = await spawnTestRun('FA', []);
    await exitAndSettle(id, 0);
    expect(getJob(id)).toBeDefined();
  });
});
