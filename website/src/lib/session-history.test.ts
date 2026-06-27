import { describe, it, expect } from 'vitest';
import { estimateTokens } from './session-history';

describe('estimateTokens', () => {
  it('approximates 1 token per 4 characters (rounded up)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});
