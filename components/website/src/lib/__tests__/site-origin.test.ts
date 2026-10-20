import { afterEach, describe, expect, it, vi } from 'vitest';
import { siteOrigin } from '../site-origin';

describe('siteOrigin', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('prefers SITE_URL so massage.<domain> is not rewritten to web.<domain>', () => {
    vi.stubEnv('SITE_URL', 'https://massage.example.test/');
    vi.stubEnv('PROD_DOMAIN', 'example.test');
    expect(siteOrigin()).toBe('https://massage.example.test');
  });

  it('falls back to web.<PROD_DOMAIN> without SITE_URL', () => {
    vi.stubEnv('SITE_URL', '');
    vi.stubEnv('PUBLIC_PROD_DOMAIN', undefined as unknown as string);
    vi.stubEnv('PROD_DOMAIN', 'brand.test');
    expect(siteOrigin()).toBe('https://web.brand.test');
  });

  it('returns an empty origin when neither is set', () => {
    vi.stubEnv('SITE_URL', '');
    vi.stubEnv('PUBLIC_PROD_DOMAIN', undefined as unknown as string);
    vi.stubEnv('PROD_DOMAIN', undefined as unknown as string);
    expect(siteOrigin()).toBe('');
  });
});
