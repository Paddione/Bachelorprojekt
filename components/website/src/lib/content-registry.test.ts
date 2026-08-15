import { describe, it, expect } from 'vitest';
import { CONTENT_REGISTRY, refFor, publicRouteFor } from './content-registry';

describe('content registry', () => {
  it('has a unique contentKey per entry', () => {
    const keys = CONTENT_REGISTRY.map((r) => r.contentKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('resolves a ref and its public route', () => {
    const ref = refFor('legal:datenschutz');
    expect(ref?.contentType).toBe('legal_page');
    expect(publicRouteFor('legal:datenschutz')).toBe('/datenschutz');
  });
  it('maps service sections to their slug route', () => {
    expect(publicRouteFor('service:coaching')).toBe('/coaching');
  });
  it('returns undefined for an unknown key', () => {
    expect(refFor('nope')).toBeUndefined();
  });
});
