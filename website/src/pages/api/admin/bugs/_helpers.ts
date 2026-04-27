const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:4321').replace(/\/$/, ''); // dev fallback

export function buildBackUrl(filters: { status: string; category: string; q: string }): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.category) params.set('category', filters.category);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  const path = `/admin/bugs${qs ? '?' + qs : ''}`;
  return `${SITE_URL}${path}`;
}

export function buildErrorUrl(backUrl: string, message: string): string {
  const sep = backUrl.includes('?') ? '&' : '?';
  return `${backUrl}${sep}error=${message}`;
}
