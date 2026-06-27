import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { corsHeaders, handlePreflight, isAllowedOrigin } from './cors';

const REACT = 'https://react.mentolder.de';
const SECOND = 'http://react.localhost';
const EVIL = 'https://evil.example';

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.REACT_APP_ORIGIN;
  process.env.REACT_APP_ORIGIN = `${REACT},${SECOND}`;
});
afterEach(() => {
  if (saved === undefined) delete process.env.REACT_APP_ORIGIN;
  else process.env.REACT_APP_ORIGIN = saved;
});

describe('isAllowedOrigin', () => {
  it('accepts an allowlisted origin', () => {
    expect(isAllowedOrigin(REACT)).toBe(true);
    expect(isAllowedOrigin(SECOND)).toBe(true);
  });
  it('rejects a foreign origin (fail-closed)', () => {
    expect(isAllowedOrigin(EVIL)).toBe(false);
  });
  it('rejects null/empty', () => {
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin('')).toBe(false);
  });
  it('fails closed when the allowlist env is unset', () => {
    delete process.env.REACT_APP_ORIGIN;
    expect(isAllowedOrigin(REACT)).toBe(false);
  });
});

describe('corsHeaders', () => {
  it('sets Allow-Origin + Allow-Credentials + Vary for an allowlisted origin', () => {
    const h = corsHeaders(REACT);
    expect(h['Access-Control-Allow-Origin']).toBe(REACT);
    expect(h['Access-Control-Allow-Credentials']).toBe('true');
    expect(h['Vary']).toBe('Origin');
  });

  it('reflects the exact requesting origin (never a wildcard)', () => {
    const h = corsHeaders(SECOND);
    expect(h['Access-Control-Allow-Origin']).toBe(SECOND);
    expect(h['Access-Control-Allow-Origin']).not.toBe('*');
  });

  it('emits NO Allow-Origin for a foreign origin (fail-closed)', () => {
    const h = corsHeaders(EVIL);
    expect(h['Access-Control-Allow-Origin']).toBeUndefined();
    expect(h['Access-Control-Allow-Credentials']).toBeUndefined();
    // Vary stays set so caches never serve a credentialed response cross-origin
    expect(h['Vary']).toBe('Origin');
  });

  it('emits NO Allow-Origin for a null origin', () => {
    expect(corsHeaders(null)['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

describe('handlePreflight', () => {
  const optionsReq = (origin: string | null) =>
    new Request('https://web.mentolder.de/api/auth/me', {
      method: 'OPTIONS',
      headers: origin ? { Origin: origin } : {},
    });

  it('returns null for non-OPTIONS requests', () => {
    const get = new Request('https://web.mentolder.de/api/auth/me', { method: 'GET', headers: { Origin: REACT } });
    expect(handlePreflight(get)).toBeNull();
  });

  it('answers an allowlisted preflight with 204 + CORS + methods/headers', () => {
    const res = handlePreflight(optionsReq(REACT));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(204);
    expect(res!.headers.get('Access-Control-Allow-Origin')).toBe(REACT);
    expect(res!.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res!.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect((res!.headers.get('Access-Control-Allow-Headers') || '').toLowerCase()).toContain('content-type');
    expect(res!.headers.get('Vary')).toBe('Origin');
  });

  it('answers a foreign preflight with 204 but NO Allow-Origin (browser blocks)', () => {
    const res = handlePreflight(optionsReq(EVIL));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(204);
    expect(res!.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
