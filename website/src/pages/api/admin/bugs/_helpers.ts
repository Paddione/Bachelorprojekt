export function buildBackUrl(filters: { status: string; category: string; q: string }): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.category) params.set('category', filters.category);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return `/admin/bugs${qs ? '?' + qs : ''}`;
}
