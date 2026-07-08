import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postError, fetchErrorHistory, podLineToError } from './error-report.js';

describe('error-report', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post error via POST /api/admin/ops/error-log without throwing', async () => {
    const report = { source: 'browser' as const, message: 'TypeError: x' };
    
    await postError(report);

    expect(mockFetch).toHaveBeenCalledWith('/api/admin/ops/error-log', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(report),
    }));
  });

  it('should return empty array when GET fails', async () => {
    mockFetch.mockImplementationOnce(async () => ({ ok: false }));
    
    const result = await fetchErrorHistory();
    expect(result).toEqual([]);
  });

  it('should parse error lines from pod logs and skip non-error lines', () => {
    const errorLine = '[2026-07-03T10:00:00.000Z] [error] TypeError: Something went wrong';
    
    const result = podLineToError(errorLine);
    expect(result).toEqual({ source: 'pod', message: errorLine });

    const infoLine = '[2026-07-03T10:00:00.000Z] [info] Everything is fine';
    
    const nullResult = podLineToError(infoLine);
    expect(nullResult).toBeNull();
  });
});
