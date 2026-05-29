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
