const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');

export function siteRedirect(path: string, status: 301 | 302 | 303 | 307 | 308 = 303): Response {
  const base = SITE_URL || 'http://localhost:4321';
  return Response.redirect(`${base}${path.startsWith('/') ? path : '/' + path}`, status);
}
