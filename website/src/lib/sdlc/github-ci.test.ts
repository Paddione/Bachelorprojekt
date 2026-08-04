import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_FETCH = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.useRealTimers();
});

describe('github-ci.aggregateCheckRuns', () => {
  it('returns pending when no runs', async () => {
    const { aggregateCheckRuns } = await import('./github-ci');
    expect(aggregateCheckRuns([])).toBe('pending');
  });

  it('returns pending when any run is not completed', async () => {
    const { aggregateCheckRuns } = await import('./github-ci');
    expect(aggregateCheckRuns([{ status: 'completed', conclusion: 'success' }, { status: 'in_progress', conclusion: null }])).toBe('pending');
  });

  it('returns failure when any run has a failure conclusion', async () => {
    const { aggregateCheckRuns } = await import('./github-ci');
    expect(aggregateCheckRuns([
      { status: 'completed', conclusion: 'success' },
      { status: 'completed', conclusion: 'timed_out' },
    ])).toBe('failure');
  });

  it('returns success when all runs are success/neutral/skipped', async () => {
    const { aggregateCheckRuns } = await import('./github-ci');
    expect(aggregateCheckRuns([
      { status: 'completed', conclusion: 'success' },
      { status: 'completed', conclusion: 'neutral' },
      { status: 'completed', conclusion: 'skipped' },
    ])).toBe('success');
  });

  it('returns pending for an unknown conclusion', async () => {
    const { aggregateCheckRuns } = await import('./github-ci');
    expect(aggregateCheckRuns([{ status: 'completed', conclusion: 'something_weird' }])).toBe('pending');
  });

  it('recognizes all failure conclusions (cancelled, action_required, …)', async () => {
    const { aggregateCheckRuns } = await import('./github-ci');
    for (const c of ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale']) {
      expect(aggregateCheckRuns([{ status: 'completed', conclusion: c }])).toBe('failure');
    }
  });
});

describe('github-ci.getPrCiStatus', () => {
  it('returns null on fetch error (fail closed)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const { getPrCiStatus } = await import('./github-ci');
    expect(await getPrCiStatus(1)).toBeNull();
  });

  it('returns null when the commits endpoint is not ok', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    const { getPrCiStatus } = await import('./github-ci');
    expect(await getPrCiStatus(2)).toBeNull();
  });

  it('returns null when the check-runs endpoint is not ok', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [{ sha: 'abc' }] })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    const { getPrCiStatus } = await import('./github-ci');
    expect(await getPrCiStatus(3)).toBeNull();
  });

  it('returns null when the commits list is empty', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    const { getPrCiStatus } = await import('./github-ci');
    expect(await getPrCiStatus(4)).toBeNull();
  });

  it('returns the aggregated check-run verdict on success', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [{ sha: 'sha-1' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ check_runs: [{ status: 'completed', conclusion: 'success' }] }) });
    const { getPrCiStatus } = await import('./github-ci');
    expect(await getPrCiStatus(5)).toBe('success');
  });

  it('caches the result for 60s', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [{ sha: 'sha-2' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ check_runs: [{ status: 'completed', conclusion: 'success' }] }) });
    const { getPrCiStatus } = await import('./github-ci');
    expect(await getPrCiStatus(6)).toBe('success');
    // Second call should hit the cache (no further fetchMock calls).
    expect(await getPrCiStatus(6)).toBe('success');
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 for commits + 1 for check-runs, none for the cached second call
  });
});
