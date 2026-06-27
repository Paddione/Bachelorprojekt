import { describe, it, expect } from 'vitest';
import { excludeTestData } from './filters';

describe('excludeTestData', () => {
  it('appends WHERE is_test_data = false when there is no WHERE clause', () => {
    const out = excludeTestData('SELECT * FROM tickets', 'tickets');
    expect(out).toBe('SELECT * FROM tickets WHERE tickets.is_test_data = false');
  });

  it('appends with a custom alias', () => {
    const out = excludeTestData('SELECT * FROM tickets t', 't');
    expect(out).toBe('SELECT * FROM tickets t WHERE t.is_test_data = false');
  });

  it('adds AND when a WHERE clause already exists', () => {
    const out = excludeTestData('SELECT * FROM tickets WHERE status = $1', 'tickets');
    expect(out).toBe(
      'SELECT * FROM tickets WHERE status = $1 AND tickets.is_test_data = false',
    );
  });

  it('is case-insensitive on the WHERE keyword', () => {
    const out = excludeTestData('SELECT * FROM tickets where id = 1', 'tickets');
    expect(out).toContain('AND tickets.is_test_data = false');
  });
});
