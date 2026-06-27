import { describe, it, expect } from 'vitest';
import { sanitizeForLog } from './sanitize';

describe('sanitizeForLog', () => {
  it('returns empty string for nullish inputs', () => {
    expect(sanitizeForLog(undefined)).toBe('');
    expect(sanitizeForLog(null)).toBe('');
    expect(sanitizeForLog('')).toBe('');
  });

  it('passes through benign input unchanged', () => {
    expect(sanitizeForLog('hello world')).toBe('hello world');
  });

  it('redacts Bearer tokens', () => {
    expect(sanitizeForLog('Authorization: Bearer abc.def.ghi')).toBe(
      'Authorization: Bearer ***',
    );
  });

  it('redacts multiple Bearer tokens', () => {
    expect(sanitizeForLog('a Bearer xxx, b Bearer yyy')).toBe('a Bearer ***, b Bearer ***');
  });

  it('redacts postgres credentials in URLs', () => {
    expect(sanitizeForLog('postgres://user:secret@host/db')).toBe('postgres://***:***@host/db');
    expect(sanitizeForLog('postgresql://alice:pw@h:5432/x')).toBe('postgresql://***:***@h:5432/x');
  });

  it('redacts email addresses', () => {
    expect(sanitizeForLog('contact alice@example.com today')).toBe('contact ***@*** today');
  });

  it('truncates strings longer than 2000 chars with a marker', () => {
    const long = 'x'.repeat(2500);
    const out = sanitizeForLog(long);
    expect(out.length).toBe(2000);
    expect(out.endsWith('… [truncated]')).toBe(true);
  });

  it('does not truncate at exactly the limit', () => {
    const exact = 'a'.repeat(2000);
    expect(sanitizeForLog(exact)).toBe(exact);
  });
});
