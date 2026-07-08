import { describe, it, expect } from 'vitest';
import { scrubClientPii } from './prompt-scrubber';

describe('scrubClientPii', () => {
  it('replaces full name in text with replacement token', () => {
    const result = scrubClientPii(
      'Termin mit Max Mustermann heute',
      { names: ['Max Mustermann'], replacement: 'K-100' }
    );
    expect(result).toBe('Termin mit K-100 heute');
  });

  it('replaces single name component >= 3 chars with replacement token', () => {
    const result = scrubClientPii(
      'Hallo Max!',
      { names: ['Max Mustermann'], replacement: 'K-100' }
    );
    expect(result).toBe('Hallo K-100!');
  });

  it('does not strip name components < 3 chars', () => {
    const result = scrubClientPii(
      'Jo kam',
      { names: ['Jo Li'], replacement: 'K-100' }
    );
    expect(result).toBe('Jo kam');
  });

  it('handles Umlaut and case-insensitive matching with word boundaries', () => {
    const result = scrubClientPii(
      'cc MÜLLER',
      { names: ['Jörg Müller'], replacement: 'K-100' }
    );
    expect(result).toBe('cc K-100');
  });

  it('replaces multiple occurrences of the same name with replacement token', () => {
    const result = scrubClientPii(
      'Max und Max',
      { names: ['Max Mustermann'], replacement: 'K-100' }
    );
    expect(result).toBe('K-100 und K-100');
  });

  it('does not replace substring matches without word boundary (Beispielhannes)', () => {
    const result = scrubClientPii(
      'Beispielhannes',
      { names: ['Hannes'], replacement: 'K-100' }
    );
    expect(result).toBe('Beispielhannes');
  });

  it('replaces e-mail addresses with replacement token (case-insensitive)', () => {
    const result = scrubClientPii(
      'mail: A.B@Example.org',
      { names: [], emails: ['a.b@example.org'], replacement: 'K-100' }
    );
    expect(result).toBe('mail: K-100');
  });

  it('returns identity when names array is empty and no emails provided', () => {
    const result = scrubClientPii(
      'beliebig',
      { names: [], replacement: '[KLIENT]' }
    );
    expect(result).toBe('beliebig');
  });
});
