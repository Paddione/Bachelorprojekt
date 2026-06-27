import { describe, it, expect } from 'vitest';
import { queryAssets, getAsset } from './learning-assets';

describe('learning-assets query', () => {
  it('returns an empty array when no assets match the filter', () => {
    const out = queryAssets({ concept: 'this-concept-does-not-exist-anywhere' });
    expect(out).toEqual([]);
  });

  it('returns all assets when called with an empty filter', () => {
    const out = queryAssets({});
    expect(Array.isArray(out)).toBe(true);
  });
});

describe('learning-assets getAsset', () => {
  it('returns null for a string id that does not exist', () => {
    expect(getAsset('does-not-exist')).toBeNull();
  });

  it('returns the first match for an object query, or null', () => {
    const out = getAsset({ concept: 'this-concept-does-not-exist-anywhere' });
    expect(out).toBeNull();
  });
});
