// Failing Test für T005901: isValidHttpUrl — http(s)-Scheme-Allowlist für
// crawl_config.startUrl (Client-Rendering + Server-Validierung teilen den Helper).
import { describe, it, expect } from 'vitest';
import { isValidHttpUrl } from './knowledge-url';

describe('isValidHttpUrl', () => {
  it('accepts http URLs', () => {
    expect(isValidHttpUrl('http://example.com/start')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(isValidHttpUrl('https://mentolder.de/docs')).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects other schemes (data:, ftp:, file:)', () => {
    expect(isValidHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isValidHttpUrl('ftp://example.com')).toBe(false);
    expect(isValidHttpUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects unparseable input', () => {
    expect(isValidHttpUrl('nicht-eine-url')).toBe(false);
  });
});
