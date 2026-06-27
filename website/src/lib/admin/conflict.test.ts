import { describe, it, expect } from 'vitest';
import { isConflict, nextVersion } from './conflict';

describe('isConflict', () => {
  it('returns false when currentVersion is null and base is 0', () => {
    expect(isConflict(null, 0)).toBe(false);
  });

  it('returns true when currentVersion is null and base is non-zero', () => {
    expect(isConflict(null, 1)).toBe(true);
  });

  it('returns false when versions match', () => {
    expect(isConflict(5, 5)).toBe(false);
  });

  it('returns true when versions differ', () => {
    expect(isConflict(5, 6)).toBe(true);
  });
});

describe('nextVersion', () => {
  it('treats null as 0 and increments', () => {
    expect(nextVersion(null)).toBe(1);
  });

  it('returns current+1 for non-null values', () => {
    expect(nextVersion(0)).toBe(1);
    expect(nextVersion(4)).toBe(5);
  });
});
