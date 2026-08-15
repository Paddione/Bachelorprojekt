import { describe, it, expect, afterEach } from 'vitest';
import { isE2ETestRequest } from './e2e-marker';

const makeRequest = (headers: Record<string, string>): Request =>
  new Request('https://example.com', { headers });

describe('isE2ETestRequest', () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('returns false when X-E2E-Test header is missing', () => {
    process.env.CRON_SECRET = 'long-enough-secret-1';
    expect(isE2ETestRequest(makeRequest({}))).toBe(false);
    expect(
      isE2ETestRequest(makeRequest({ 'X-Cron-Secret': 'long-enough-secret-1' })),
    ).toBe(false);
  });

  it('returns false when X-E2E-Test is empty string', () => {
    process.env.CRON_SECRET = 'long-enough-secret-1';
    expect(
      isE2ETestRequest(
        makeRequest({ 'X-E2E-Test': '', 'X-Cron-Secret': 'long-enough-secret-1' }),
      ),
    ).toBe(false);
  });

  it('returns false when CRON_SECRET env is unset (fail-closed)', () => {
    delete process.env.CRON_SECRET;
    expect(
      isE2ETestRequest(
        makeRequest({ 'X-E2E-Test': '1', 'X-Cron-Secret': 'whatever' }),
      ),
    ).toBe(false);
  });

  it('returns false when X-Cron-Secret is missing', () => {
    process.env.CRON_SECRET = 'long-enough-secret-1';
    expect(isE2ETestRequest(makeRequest({ 'X-E2E-Test': '1' }))).toBe(false);
  });

  it('returns false when X-Cron-Secret length differs', () => {
    process.env.CRON_SECRET = 'long-enough-secret-1';
    expect(
      isE2ETestRequest(
        makeRequest({ 'X-E2E-Test': '1', 'X-Cron-Secret': 'short' }),
      ),
    ).toBe(false);
  });

  it('returns false on wrong secret', () => {
    process.env.CRON_SECRET = 'long-enough-secret-1';
    expect(
      isE2ETestRequest(
        makeRequest({
          'X-E2E-Test': '1',
          'X-Cron-Secret': 'long-enough-secret-2',
        }),
      ),
    ).toBe(false);
  });

  it('returns true on correct secret + E2E flag', () => {
    process.env.CRON_SECRET = 'long-enough-secret-1';
    expect(
      isE2ETestRequest(
        makeRequest({
          'X-E2E-Test': '1',
          'X-Cron-Secret': 'long-enough-secret-1',
        }),
      ),
    ).toBe(true);
  });

  it('accepts any truthy X-E2E-Test value', () => {
    process.env.CRON_SECRET = 'long-enough-secret-1';
    expect(
      isE2ETestRequest(
        makeRequest({
          'X-E2E-Test': 'yes',
          'X-Cron-Secret': 'long-enough-secret-1',
        }),
      ),
    ).toBe(true);
  });

  it('returns false when NODE_ENV is production (fail-closed)', () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.CRON_SECRET = 'long-enough-secret-1';
    try {
      expect(
        isE2ETestRequest(
          makeRequest({
            'X-E2E-Test': '1',
            'X-Cron-Secret': 'long-enough-secret-1',
          }),
        ),
      ).toBe(false);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
    }
  });
});
