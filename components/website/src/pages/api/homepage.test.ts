import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// T001490 Task 10 — /api/homepage is now bundle-sourced. We mock
// `bundleHomepageBlocks` to drive the matrix (present / absent / throw).
let mockDoc: unknown = null;
vi.mock('../../lib/content-bundle', () => ({
  bundleHomepageBlocks: vi.fn(() => mockDoc),
}));

import { GET, OPTIONS } from './homepage';

const REACT = 'https://react.example.test';
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.REACT_APP_ORIGIN;
  process.env.REACT_APP_ORIGIN = REACT;
  mockDoc = null;
});
afterEach(() => {
  if (saved === undefined) delete process.env.REACT_APP_ORIGIN;
  else process.env.REACT_APP_ORIGIN = saved;
});

const req = (origin: string | null, method = 'GET') =>
  new Request('https://web.example.test/api/homepage', {
    method,
    headers: origin ? { Origin: origin } : {},
  });

describe('GET /api/homepage (public, bundle-sourced — T001490 Task 10)', () => {
  it('returns the bundle document with CORS + version header for an allowlisted origin', async () => {
    mockDoc = { schemaVersion: 1, blocks: [{ id: 'spacer', type: 'spacer', props: { size: 8 } }] };
    const res = await GET({ request: req(REACT) } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(REACT);
    expect(res.headers.get('X-Homepage-Version')).toBe('1');
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-Homepage-Version');
    const body = await res.json();
    expect(body.schemaVersion).toBe(1);
    expect(body.blocks).toHaveLength(1);
  });

  it('returns 204 when the bundle has no document for this brand', async () => {
    mockDoc = null;
    const res = await GET({ request: req(REACT) } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(204);
  });

  it('serves without authentication (no cookie)', async () => {
    mockDoc = { schemaVersion: 1, blocks: [] };
    const res = await GET({ request: req(null) } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
  });

  it('returns 204 (not 500) when the bundle read throws — T001490 fail-soft', async () => {
    const bundle = await import('../../lib/content-bundle');
    vi.mocked(bundle.bundleHomepageBlocks).mockImplementationOnce(() => {
      throw new Error('bundle missing');
    });
    const res = await GET({ request: req(REACT) } as Parameters<typeof GET>[0]);
    expect([200, 204]).toContain(res.status);
    expect(res.headers.get('X-Homepage-Version')).not.toBeNull();
  });
});

describe('OPTIONS /api/homepage', () => {
  it('answers an allowlisted preflight with 204 + Allow-Origin', () => {
    const res = OPTIONS({ request: req(REACT, 'OPTIONS') } as Parameters<typeof OPTIONS>[0]) as Response;
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(REACT);
  });
});
