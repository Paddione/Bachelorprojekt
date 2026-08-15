import { describe, it, expect } from 'vitest';
import { checkRateLimit, getClientIp } from './rate-limit';

const makeRequest = (headers: Record<string, string>): Request =>
  new Request('https://example.com', { headers });

describe('checkRateLimit', () => {
  it('allows the first request through a fresh window', () => {
    const key = `k-${Math.random()}`;
    expect(checkRateLimit(key, 2, 1000)).toBe(true);
  });

  it('rejects once the limit is reached in the same window', () => {
    const key = `k-${Math.random()}`;
    expect(checkRateLimit(key, 2, 1000)).toBe(true);
    expect(checkRateLimit(key, 2, 1000)).toBe(true);
    expect(checkRateLimit(key, 2, 1000)).toBe(false);
    expect(checkRateLimit(key, 2, 1000)).toBe(false);
  });

  it('opens a new window after the previous expires', async () => {
    const key = `k-${Math.random()}`;
    expect(checkRateLimit(key, 1, 25)).toBe(true);
    expect(checkRateLimit(key, 1, 25)).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(checkRateLimit(key, 1, 25)).toBe(true);
  });

  it('tracks keys independently', () => {
    const a = `k-${Math.random()}`;
    const b = `k-${Math.random()}`;
    expect(checkRateLimit(a, 1, 1000)).toBe(true);
    expect(checkRateLimit(a, 1, 1000)).toBe(false);
    expect(checkRateLimit(b, 1, 1000)).toBe(true);
  });
});

describe('getClientIp', () => {
  it('extracts the first IP from x-forwarded-for', () => {
    const req = makeRequest({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const req = makeRequest({ 'x-real-ip': '9.9.9.9' });
    expect(getClientIp(req)).toBe('9.9.9.9');
  });

  it('prefers x-forwarded-for over x-real-ip', () => {
    const req = makeRequest({
      'x-forwarded-for': '1.1.1.1',
      'x-real-ip': '2.2.2.2',
    });
    expect(getClientIp(req)).toBe('1.1.1.1');
  });

  it('returns "unknown" when no IP headers present', () => {
    expect(getClientIp(makeRequest({}))).toBe('unknown');
  });
});
