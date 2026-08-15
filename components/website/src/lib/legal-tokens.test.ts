import { describe, it, expect } from 'vitest';
import { resolveTokens, STAMMDATEN_TOKENS } from './legal-tokens';

const sd = { name: 'PK', email: 'a@b.de', city: 'Lüneburg', phone: '0123', street: 's', zip: 'z', role: 'Coach', ustId: 'u', website: 'w', avatarInitials: 'PK' };

describe('resolveTokens', () => {
  it('replaces known stammdaten tokens', () => {
    expect(resolveTokens('Mail: {{stammdaten.email}} in {{stammdaten.city}}', sd)).toBe('Mail: a@b.de in Lüneburg');
  });
  it('renders unknown tokens as empty', () => {
    expect(resolveTokens('x {{stammdaten.nope}} y', sd)).toBe('x  y');
  });
  it('leaves non-token braces alone', () => {
    expect(resolveTokens('use { like this }', sd)).toBe('use { like this }');
  });
  it('exposes the token catalogue for the editor palette', () => {
    expect(STAMMDATEN_TOKENS).toContain('{{stammdaten.email}}');
  });
});

import { getDefaultDatenschutz } from './legal-defaults';
it('defaults emit tokens, not baked contact values', () => {
  const ds = getDefaultDatenschutz();
  expect(ds).toContain('{{stammdaten.email}}');
  expect(ds).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/); // no literal email
});

describe('proposeRetokenize', () => {
  it('proposes replacing baked contact strings with tokens', async () => {
    const { proposeRetokenize } = await import('./legal-tokens');
    const html = '<p>Mail: a@b.de, Stadt: Lüneburg</p>';
    const sd = { email: 'a@b.de', city: 'Lüneburg' };
    const { result, replacements } = proposeRetokenize(html, sd);
    expect(result).toBe('<p>Mail: {{stammdaten.email}}, Stadt: {{stammdaten.city}}</p>');
    expect(replacements).toContainEqual({ from: 'a@b.de', to: '{{stammdaten.email}}' });
  });
});
