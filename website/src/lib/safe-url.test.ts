import { describe, it, expect } from 'vitest';
import { safeHttpUrl } from './safe-url';

// T005900: Wächter gegen den Stored-XSS-Vektor — crawl_config.startUrl darf nur als
// http/https-Link gerendert werden. javascript:/data:/Nicht-URLs → null.

describe('safeHttpUrl', () => {
  it('returns the href for an https URL', () => {
    expect(safeHttpUrl('https://example.com/docs')).toBe('https://example.com/docs');
  });

  it('returns the href for an http URL', () => {
    expect(safeHttpUrl('http://example.com/docs')).toBe('http://example.com/docs');
  });

  it('returns null for a javascript: scheme', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
  });

  it('returns null for a data: scheme', () => {
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('returns null for non-URL garbage', () => {
    expect(safeHttpUrl('keine url')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl(null as unknown as string)).toBeNull();
  });
});
