// Prüfmodus: Output-Verifikation — die Tests rufen die Funktionen auf und prüfen
// deren Rückgabewert, nicht den Quelltext. [T003036]
//
// Hintergrund: Bis T003036 leiteten `sdlc/cockpit.astro` und `sdlc/app-catalog.astro`
// unauthentifizierte Aufrufe auf ein nacktes `/login` um, und `login.astro` reichte
// nichts an `/api/auth/login` weiter. Dort griff der Fallback `|| '/'`, sodass nach
// dem OIDC-Login auf `/` gelandet wurde — im sdlc-Build eine nicht existierende Route.
// Diese Datei sichert die Ableitung des Redirect-Ziels als eigene, testbare Einheit.
import { describe, it, expect } from 'vitest';
import { buildLoginRedirect, forwardReturnTo } from './login-redirect';

describe('buildLoginRedirect', () => {
  it('carries the requested path into returnTo', () => {
    const target = buildLoginRedirect(new URL('https://sdlc.test/sdlc/cockpit'));
    const returnTo = new URL(target, 'https://sdlc.test').searchParams.get('returnTo');
    expect(returnTo).toBe('/sdlc/cockpit');
  });

  it('preserves the query string so the cockpit tab survives the login', () => {
    const target = buildLoginRedirect(new URL('https://sdlc.test/sdlc/cockpit?tab=kosten'));
    const returnTo = new URL(target, 'https://sdlc.test').searchParams.get('returnTo');
    expect(returnTo).toBe('/sdlc/cockpit?tab=kosten');
  });

  it('points at the login page', () => {
    const target = buildLoginRedirect(new URL('https://sdlc.test/sdlc/app-catalog'));
    expect(new URL(target, 'https://sdlc.test').pathname).toBe('/login');
  });

  it('encodes the returnTo value so its query does not leak into the outer URL', () => {
    // Ohne Encoding würde `?tab=kosten` als zweiter Parameter der /login-URL
    // gelesen und `returnTo` wäre auf den Pfad verkürzt.
    const target = buildLoginRedirect(new URL('https://sdlc.test/sdlc/cockpit?tab=kosten'));
    const params = new URL(target, 'https://sdlc.test').searchParams;
    expect(params.get('tab')).toBeNull();
  });
});

describe('forwardReturnTo', () => {
  it('passes an existing returnTo on to the auth endpoint', () => {
    const target = forwardReturnTo(new URL('https://sdlc.test/login?returnTo=%2Fsdlc%2Fcockpit'));
    const url = new URL(target, 'https://sdlc.test');
    expect(url.pathname).toBe('/api/auth/login');
    expect(url.searchParams.get('returnTo')).toBe('/sdlc/cockpit');
  });

  it('keeps the query string of the forwarded target intact', () => {
    const target = forwardReturnTo(
      new URL('https://sdlc.test/login?returnTo=%2Fsdlc%2Fcockpit%3Ftab%3Danalytics'),
    );
    const returnTo = new URL(target, 'https://sdlc.test').searchParams.get('returnTo');
    expect(returnTo).toBe('/sdlc/cockpit?tab=analytics');
  });

  it('falls back to the bare auth endpoint when no returnTo was given', () => {
    const target = forwardReturnTo(new URL('https://sdlc.test/login'));
    const url = new URL(target, 'https://sdlc.test');
    expect(url.pathname).toBe('/api/auth/login');
    expect(url.searchParams.get('returnTo')).toBeNull();
  });
});
