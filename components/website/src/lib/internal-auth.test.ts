import { describe, it, expect, vi, afterEach } from 'vitest';

import { requireInternalToken } from './internal-auth';

function req(auth?: string): Request {
  return new Request('http://localhost/api/meeting/finalize', {
    method: 'POST',
    headers: auth ? { authorization: auth } : {},
  });
}

describe('internal-auth: shared-secret gate (F4)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 when MEETING_INTERNAL_TOKEN is not configured (fail closed)', () => {
    vi.stubEnv('MEETING_INTERNAL_TOKEN', '');
    const res = requireInternalToken(req('Bearer anything'));
    expect(res?.status).toBe(503);
  });

  it('returns 401 without credentials', () => {
    vi.stubEnv('MEETING_INTERNAL_TOKEN', 's3cret-token');
    expect(requireInternalToken(req())?.status).toBe(401);
  });

  it('returns 401 for a wrong token (constant-time compare)', () => {
    vi.stubEnv('MEETING_INTERNAL_TOKEN', 's3cret-token');
    expect(requireInternalToken(req('Bearer wrong-token!!'))?.status).toBe(401);
  });

  it('returns null for the correct bearer token', () => {
    vi.stubEnv('MEETING_INTERNAL_TOKEN', 's3cret-token');
    expect(requireInternalToken(req('Bearer s3cret-token'))).toBeNull();
  });
});
