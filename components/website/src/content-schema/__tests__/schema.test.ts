import { describe, it, expect } from 'vitest';
import { ContentBundleSchema, HomepageBlocksSchema } from '../index';

describe('content-schema', () => {
  it('exposes a schema for every content domain', () => {
    const domains = Object.keys(ContentBundleSchema).sort();
    expect(domains).toContain('homepage');
    expect(domains).toContain('homepage-blocks');
    expect(domains).toContain('kore-flags');
    expect(domains).toHaveLength(13);
  });

  it('rejects a homepage-blocks doc with the wrong schemaVersion', () => {
    const bad = { schemaVersion: 999, blocks: [] };
    expect(HomepageBlocksSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a minimal valid homepage-blocks doc', () => {
    const ok = { schemaVersion: 1, blocks: [] };
    expect(HomepageBlocksSchema.safeParse(ok).success).toBe(true);
  });
});
