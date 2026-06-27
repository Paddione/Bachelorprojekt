import { describe, it, expect } from 'vitest';
import { idsToPrune, KEEP_PER_KEY } from './version-prune';

describe('idsToPrune', () => {
  it('returns an empty array when fewer than KEEP_PER_KEY ids are provided', () => {
    expect(idsToPrune([1, 2, 3])).toEqual([]);
  });

  it('returns an empty array at exactly the KEEP_PER_KEY boundary', () => {
    const ids = Array.from({ length: KEEP_PER_KEY }, (_, i) => i + 1);
    expect(idsToPrune(ids)).toEqual([]);
  });

  it('returns everything past the KEEP_PER_KEY boundary, in the order given (newest-first)', () => {
    const ids = Array.from({ length: KEEP_PER_KEY + 5 }, (_, i) => KEEP_PER_KEY + 5 - i);
    // First KEEP_PER_KEY (55) are kept, the rest is pruned. Since input is newest-first,
    // the pruned slice preserves that order.
    const out = idsToPrune(ids);
    expect(out).toHaveLength(5);
    // The kept items are the newest KEEP_PER_KEY; the pruned ones are the older tail.
    expect(out).toEqual([5, 4, 3, 2, 1]);
  });

  it('handles a single extra id', () => {
    const ids = Array.from({ length: KEEP_PER_KEY + 1 }, (_, i) => KEEP_PER_KEY + 1 - i);
    expect(idsToPrune(ids)).toEqual([1]);
  });
});
