/**
 * Login-Redirect-Helfer für die SDLC-Console.
 *
 * Das returnTo-Ziel geht durch die gesamte Login-Kette, damit der User nach dem
 * OIDC-Login genau dorthin zurückkehrt, wo er herkam — inklusive Query-String
 * (Tab-Auswahl wie ?tab=analytics bleibt erhalten). Ohne diese Durchreichung
 * griff der Fallback || '/' in api/auth/login.ts → 404 im sdlc-Build.
 *
 * Beide Funktionen bauen die Query mit URLSearchParams — kein händisches
 * String-Zusammenbauen, kein offenes Encoding vergessen. [T003036]
 */

/**
 * Leitet auf /login um und gibt das aktuelle Ziel als returnTo mit.
 * URLSearchParams übernimmt das korrekte Encoding — der Query-Teil des Ziels
 * wird maskiert und kann nicht als zweiter Parameter der /login-URL gelesen
 * werden.
 */
export function buildLoginRedirect(url: URL): string {
  const returnTo = url.pathname + url.search;
  const params = new URLSearchParams();
  params.set('returnTo', returnTo);
  return `/login?${params.toString()}`;
}

/**
 * Reicht einen vorhandenen returnTo-Parameter an /api/auth/login weiter.
 * Fehlt er, wird /api/auth/login ohne Query aufgerufen.
 */
export function forwardReturnTo(url: URL): string {
  const returnTo = url.searchParams.get('returnTo');
  if (!returnTo) return '/api/auth/login';
  const params = new URLSearchParams();
  params.set('returnTo', returnTo);
  return `/api/auth/login?${params.toString()}`;
}
