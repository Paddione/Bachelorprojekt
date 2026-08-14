// Failing Test für T005901: der PATCH-Endpoint muss javascript:-startUrls
// mit 400 ablehnen (Scheme-Allowlist), statt sie als gültige URL zu speichern.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../../../lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
  isAdmin: vi.fn(() => true),
}));
vi.mock('../../../../../../../lib/knowledge-db', () => ({
  getCollection: vi.fn().mockResolvedValue({
    id: 'c1',
    source: 'web_crawl',
    crawl_config: null,
  }),
  updateCrawlConfig: vi.fn().mockResolvedValue(undefined),
}));

import { PATCH } from './crawl-config';

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/knowledge/collections/c1/crawl-config', {
    method: 'PATCH',
    headers: { cookie: 'sid=x', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('crawl-config PATCH scheme allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects javascript: startUrl with 400', async () => {
    const res = await PATCH({ request: patchRequest({ startUrl: 'javascript:alert(1)', maxDepth: 2 }), params: { id: 'c1' } });
    expect(res.status).toBe(400);
  });

  it('accepts a valid https startUrl', async () => {
    const res = await PATCH({ request: patchRequest({ startUrl: 'https://mentolder.de/docs' }), params: { id: 'c1' } });
    expect(res.status).toBe(200);
  });
});
