import { describe, it, expect } from 'vitest';
import { getAsset, queryAssets } from './learning-assets';

describe('queryAssets', () => {
  it('filters by register and tone', () => {
    const r = queryAssets({ register: 'technical', tone: 'active' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((a) => a.register === 'technical' && a.tone === 'active')).toBe(true);
  });
  it('matches concept membership', () => {
    expect(queryAssets({ concept: 'feedback-loop' }).some((a) => a.id === 'feedback-loop.active')).toBe(true);
  });
});

describe('getAsset', () => {
  it('resolves by id', () => {
    expect(getAsset('feedback-loop.active')?.id).toBe('feedback-loop.active');
  });
  it('returns null for an unknown id', () => {
    expect(getAsset('nope.nope')).toBeNull();
  });
  it('returns the first match for a query', () => {
    expect(getAsset({ concept: 'reflection', register: 'coaching' })?.tone).toBe('calm');
  });
});
