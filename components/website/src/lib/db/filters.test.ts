import { describe, it, expect } from 'vitest';
import { excludeTestData } from './filters';

describe('excludeTestData', () => {
  it('appends WHERE for SELECT without WHERE', () => {
    const sql = excludeTestData('SELECT * FROM auth.users', 'auth.users');
    expect(sql).toBe('SELECT * FROM auth.users WHERE auth.users.is_test_data = false');
  });

  it('appends AND for SELECT with WHERE', () => {
    const sql = excludeTestData(
      'SELECT * FROM auth.users WHERE active = true',
      'auth.users'
    );
    expect(sql).toBe(
      'SELECT * FROM auth.users WHERE active = true AND auth.users.is_test_data = false'
    );
  });

  it('handles aliased table', () => {
    const sql = excludeTestData(
      'SELECT * FROM auth.users u WHERE u.active = true',
      'u'
    );
    expect(sql).toBe(
      'SELECT * FROM auth.users u WHERE u.active = true AND u.is_test_data = false'
    );
  });
});
