import { describe, it, expect } from 'vitest';
import { clientIpFromRequest, recordAudit } from './audit-log';

describe('clientIpFromRequest', () => {
  it('returns null when the x-forwarded-for header is missing', () => {
    const req = new Request('https://example.com');
    expect(clientIpFromRequest(req)).toBeNull();
  });

  it('returns the first IP in the x-forwarded-for header', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(clientIpFromRequest(req)).toBe('1.2.3.4');
  });

  it('trims whitespace around the first IP', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '   9.9.9.9  , 10.10.10.10' },
    });
    expect(clientIpFromRequest(req)).toBe('9.9.9.9');
  });

  it('returns null when the header is just commas / whitespace', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': ' , , ' },
    });
    expect(clientIpFromRequest(req)).toBeNull();
  });
});

describe('recordAudit (DB failure path)', () => {
  it('does not throw when the pool query fails', async () => {
    const fakePool = {
      query: () => Promise.reject(new Error('db down')),
    } as unknown as Parameters<typeof recordAudit>[0];
    const originalWarn = console.warn;
    console.warn = () => undefined;
    try {
      await expect(
        recordAudit(fakePool, { action: 'login' }),
      ).resolves.toBeUndefined();
    } finally {
      console.warn = originalWarn;
    }
  });
});
