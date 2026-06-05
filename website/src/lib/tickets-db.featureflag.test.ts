// website/src/lib/tickets-db.featureflag.test.ts [T000413]
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({
  pool: { query: (...a: unknown[]) => query(...a), connect: vi.fn() },
  ensureSchemaOnce: vi.fn(),
}));
vi.mock('./knowledge-db', () => ({ MixedEmbeddingModelError: class {} }));

import { isFeatureEnabled } from './tickets-db';

describe('isFeatureEnabled', () => {
  beforeEach(() => query.mockReset());

  it('returns true when an enabled row exists for (brand,key)', async () => {
    query.mockResolvedValueOnce({ rows: [{ enabled: true }] });
    await expect(isFeatureEnabled('mentolder', 'new-hero')).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM tickets.feature_flags'),
      ['mentolder', 'new-hero'],
    );
  });

  it('returns false when no row exists', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(isFeatureEnabled('korczewski', 'missing')).resolves.toBe(false);
  });

  it('fails closed (false) when the query throws', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    await expect(isFeatureEnabled('mentolder', 'x')).resolves.toBe(false);
  });
});
