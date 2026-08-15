import { describe, it, expect } from 'vitest';
import { idsToPrune, KEEP_PER_KEY } from './version-prune';

describe('idsToPrune', () => {
  it('keeps the newest KEEP_PER_KEY ids, returns the rest (oldest) for deletion', () => {
    const newestFirst = Array.from({ length: KEEP_PER_KEY + 3 }, (_, i) => i + 1);
    expect(idsToPrune(newestFirst)).toEqual([
      KEEP_PER_KEY + 1, KEEP_PER_KEY + 2, KEEP_PER_KEY + 3,
    ]);
  });
  it('returns [] when at or under the cap', () => {
    expect(idsToPrune([1, 2, 3])).toEqual([]);
    expect(idsToPrune(Array.from({ length: KEEP_PER_KEY }, (_, i) => i))).toEqual([]);
  });
  it('handles empty input', () => {
    expect(idsToPrune([])).toEqual([]);
  });
});
