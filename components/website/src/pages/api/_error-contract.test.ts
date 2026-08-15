import { describe, it, expect } from 'vitest';
import { errorResponse } from './_errors';

describe('errorResponse', () => {
  it('returns JSON with a code and requestId, status defaulting to 500', async () => {
    const res = errorResponse('METRICS_FETCH_FAILED', 'req-xyz');
    expect(res.status).toBe(500);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    const body = await res.json();
    expect(body).toEqual({ error: 'METRICS_FETCH_FAILED', requestId: 'req-xyz' });
  });

  it('never leaks a stack trace in the body', async () => {
    const res = errorResponse('DB_ERROR', 'req-1', 503);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/at .*\(/);
    expect(res.status).toBe(503);
  });
});
