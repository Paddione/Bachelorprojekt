import { describe, it, expect } from 'vitest';
import { sanitizeForLog } from '../sanitize';

describe('sanitizeForLog', () => {
  it('masks Bearer tokens', () => {
    expect(sanitizeForLog('Failed with Authorization: Bearer abc.def.ghi'))
      .toBe('Failed with Authorization: Bearer ***');
  });

  it('masks postgres URLs', () => {
    expect(sanitizeForLog('connection string postgres://user:secret@host:5432/db'))
      .toBe('connection string postgres://***:***@host:5432/db');
  });

  it('masks email addresses', () => {
    expect(sanitizeForLog('user not found: alice@example.com'))
      .toBe('user not found: ***@***');
  });

  it('passes through error messages without secrets', () => {
    expect(sanitizeForLog('Deployment not found'))
      .toBe('Deployment not found');
  });

  it('handles undefined input', () => {
    expect(sanitizeForLog(undefined)).toBe('');
  });

  it('truncates very long messages', () => {
    const long = 'x'.repeat(5000);
    expect(sanitizeForLog(long).length).toBeLessThanOrEqual(2000);
  });
});
