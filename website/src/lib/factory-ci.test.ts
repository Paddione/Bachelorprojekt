import { describe, it, expect } from 'vitest';
import { normalizeChecks, rollupConclusion } from './factory-ci';

describe('factory-ci normalization', () => {
  it('normalizes GitHub check-run objects', () => {
    const out = normalizeChecks([
      { name: 'CI', status: 'completed', conclusion: 'success', details_url: 'u1' },
      { name: 'e2e', status: 'in_progress', conclusion: null, details_url: 'u2' },
    ]);
    expect(out).toEqual([
      { name: 'CI', status: 'completed', conclusion: 'success', url: 'u1' },
      { name: 'e2e', status: 'in_progress', conclusion: null, url: 'u2' },
    ]);
  });

  it('rolls up to failure if any check failed', () => {
    expect(rollupConclusion([
      { name: 'a', status: 'completed', conclusion: 'success', url: '' },
      { name: 'b', status: 'completed', conclusion: 'failure', url: '' },
    ])).toBe('failure');
  });
  it('rolls up to pending if any check is still running', () => {
    expect(rollupConclusion([
      { name: 'a', status: 'completed', conclusion: 'success', url: '' },
      { name: 'b', status: 'in_progress', conclusion: null, url: '' },
    ])).toBe('pending');
  });
  it('rolls up to success when all succeeded', () => {
    expect(rollupConclusion([{ name: 'a', status: 'completed', conclusion: 'success', url: '' }])).toBe('success');
  });
  it('returns null rollup for no checks', () => {
    expect(rollupConclusion([])).toBe(null);
  });
});
