import { describe, it, expect } from 'vitest';
import { matchesInternalToken, internalUnauthorized } from './internal-auth';

const SECRET = 'test-internal-token-0123456789';

const req = (headers: Record<string, string> = {}) =>
  new Request('https://web.example.test/api/meeting/save-transcript', {
    method: 'POST',
    headers,
  });

describe('matchesInternalToken', () => {
  it('accepts a correct Bearer token', () => {
    expect(matchesInternalToken(req({ Authorization: `Bearer ${SECRET}` }), SECRET)).toBe(true);
  });

  it('accepts a correct x-internal-token header', () => {
    expect(matchesInternalToken(req({ 'x-internal-token': SECRET }), SECRET)).toBe(true);
  });

  it('rejects a wrong Bearer token', () => {
    expect(matchesInternalToken(req({ Authorization: 'Bearer wrong-token-value-0000' }), SECRET)).toBe(false);
  });

  it('rejects a wrong x-internal-token header', () => {
    expect(matchesInternalToken(req({ 'x-internal-token': 'wrong' }), SECRET)).toBe(false);
  });

  it('rejects requests without any token', () => {
    expect(matchesInternalToken(req(), SECRET)).toBe(false);
  });

  it('rejects a same-length Bearer token with different content', () => {
    expect(matchesInternalToken(req({ Authorization: 'Bearer test-internal-token-0123456780' }), SECRET)).toBe(false);
  });

  it('fails closed when no expected token is configured', () => {
    expect(matchesInternalToken(req({ Authorization: `Bearer ${SECRET}` }), '')).toBe(false);
    expect(matchesInternalToken(req({ 'x-internal-token': SECRET }), '')).toBe(false);
  });

  it('rejects tokens with a different length', () => {
    expect(matchesInternalToken(req({ Authorization: 'Bearer short' }), SECRET)).toBe(false);
  });

  it('does not accept a Bearer token via the wrong scheme', () => {
    expect(matchesInternalToken(req({ Authorization: `Token ${SECRET}` }), SECRET)).toBe(false);
  });
});

describe('internalUnauthorized', () => {
  it('returns 401 with a JSON error body', async () => {
    const res = internalUnauthorized();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });
});
