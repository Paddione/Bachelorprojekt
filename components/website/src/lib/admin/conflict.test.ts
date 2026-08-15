import { describe, it, expect } from 'vitest';
import { isConflict, nextVersion } from './conflict';

describe('isConflict', () => {
  it('flags a stale base version', () => {
    expect(isConflict(3, 2)).toBe(true);   // current=3, base=2 → someone saved
  });
  it('allows a matching base version', () => {
    expect(isConflict(2, 2)).toBe(false);
  });
  it('treats a null current row (brand-new key) as no conflict when base is 0', () => {
    expect(isConflict(null, 0)).toBe(false);
    expect(isConflict(null, 1)).toBe(true); // editor thinks it had v1 but row is gone
  });
});

describe('nextVersion', () => {
  it('starts at 1 for a new row', () => { expect(nextVersion(null)).toBe(1); });
  it('increments an existing row', () => { expect(nextVersion(4)).toBe(5); });
});
