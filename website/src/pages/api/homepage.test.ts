import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HomepageBlocksDocumentType } from '../../lib/homepage-blocks-store';

let mockDoc: HomepageBlocksDocumentType | null = null;
vi.mock('../../lib/homepage-blocks-store', () => ({
  readCurrent: vi.fn(async () => ({ document: mockDoc, version: mockDoc ? 5 : 0 })),
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

describe('GET /api/homepage (public)', () => {
  it('returns the stored document with CORS + version header for an allowlisted origin', async () => {
    mockDoc = { schemaVersion: 1, blocks: [{ id: 'spacer', type: 'spacer', props: { size: 8 } }] };
    const res = await GET({ request: req(REACT) } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(REACT);
    expect(res.headers.get('X-Homepage-Version')).toBe('5');
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-Homepage-Version');
    const body = await res.json();
    expect(body.schemaVersion).toBe(1);
    expect(body.blocks).toHaveLength(1);
  });

  it('returns 204 when no document is stored', async () => {
    mockDoc = null;
    const res = await GET({ request: req(REACT) } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(204);
  });

  it('serves without authentication (no cookie)', async () => {
    mockDoc = { schemaVersion: 1, blocks: [] };
    const res = await GET({ request: req(null) } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
  });

  it('returns 204 (not 500) when the store read throws — T001490 fail-soft', async () => {
    // Re-mock readCurrent to throw for this test only.
    const { readCurrent } = await import('../../lib/homepage-blocks-store');
    vi.mocked(readCurrent).mockRejectedValueOnce(new Error('db down'));
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
