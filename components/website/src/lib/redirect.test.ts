import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('siteRedirect (legacy constant-loaded module)', () => {
  const ORIGINAL = process.env.SITE_URL;
  beforeAll(() => {
    process.env.SITE_URL = 'https://mentolder.de';
  });
  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = ORIGINAL;
  });

  it('uses SITE_URL from the environment, with status 303 by default', async () => {
    const mod = await import('./redirect');
    const res = mod.siteRedirect('/admin');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://mentolder.de/admin');
  });

  it('prefixes a leading slash if the path is missing one', async () => {
    const mod = await import('./redirect');
    const res = mod.siteRedirect('admin/cockpit');
    expect(res.headers.get('location')).toBe('https://mentolder.de/admin/cockpit');
  });

  it('respects the requested status code', async () => {
    const mod = await import('./redirect');
    expect(mod.siteRedirect('/x', 301).status).toBe(301);
    expect(mod.siteRedirect('/x', 308).status).toBe(308);
  });
});
