import { describe, it, expect } from 'vitest';
import { resolveTokens, proposeRetokenize, STAMMDATEN_FIELDS, STAMMDATEN_TOKENS } from './legal-tokens';
import type { Stammdaten } from './website-db';

const sample: Partial<Stammdaten> = {
  name: 'Patrick Korczewski',
  role: 'Coach',
  email: 'hi@example.com',
  phone: '+49 30 1234567',
  city: 'Berlin',
  ustId: 'DE123456789',
};

describe('STAMMDATEN_FIELDS / STAMMDATEN_TOKENS', () => {
  it('exposes the expected field list', () => {
    expect(STAMMDATEN_FIELDS).toContain('name');
    expect(STAMMDATEN_FIELDS).toContain('ustId');
    expect(STAMMDATEN_TOKENS).toContain('{{stammdaten.name}}');
    expect(STAMMDATEN_TOKENS).toContain('{{stammdaten.ustId}}');
  });
});

describe('resolveTokens', () => {
  it('replaces every stammdaten.* token with the matching value', () => {
    const out = resolveTokens(
      '<p>{{stammdaten.name}} ({{stammdaten.role}})</p><a href="mailto:{{stammdaten.email}}">',
      sample,
    );
    expect(out).toBe('<p>Patrick Korczewski (Coach)</p><a href="mailto:hi@example.com">');
  });

  it('replaces missing tokens with empty string', () => {
    const out = resolveTokens('hi {{stammdaten.name}}, city: {{stammdaten.city}}', { name: 'A' });
    expect(out).toBe('hi A, city: ');
  });

  it('passes through HTML without stammdaten tokens', () => {
    const html = '<p>static content</p>';
    expect(resolveTokens(html, sample)).toBe(html);
  });
});

describe('proposeRetokenize', () => {
  it('replaces literal values with tokens when present', () => {
    const { result, replacements } = proposeRetokenize(
      '<p>Patrick Korczewski — Coach</p>',
      sample,
    );
    expect(result).toBe('<p>{{stammdaten.name}} — {{stammdaten.role}}</p>');
    expect(replacements.length).toBeGreaterThan(0);
  });

  it('reports no replacements for html with no matching values', () => {
    const { result, replacements } = proposeRetokenize(
      '<p>nothing here</p>',
      sample,
    );
    expect(result).toBe('<p>nothing here</p>');
    expect(replacements).toEqual([]);
  });
});
