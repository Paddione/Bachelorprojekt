import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getEffectiveServices } from '../../../../lib/content';
import { listCustomSections } from '../../../../lib/website-db';

const STATIC_PAGES: Array<{ key: string; label: string; path: string }> = [
  { key: 'home', label: 'Startseite', path: '/' },
  { key: 'kontakt', label: 'Kontakt', path: '/kontakt' },
  { key: 'ueber-mich', label: 'Über mich', path: '/ueber-mich' },
  { key: 'leistungen', label: 'Angebote', path: '/leistungen' },
  { key: 'referenzen', label: 'Referenzen', path: '/referenzen' },
];

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const services = await getEffectiveServices().catch(() => []);
  const customSections = await listCustomSections().catch(() => []);

  const servicePages = services
    .filter((s) => !s.hidden)
    .map((s) => ({ key: s.slug, label: `/${s.slug}`, path: `/${s.slug}` }));

  const sectionPages = customSections.map((cs) => ({
    key: cs.slug,
    label: cs.title,
    path: `/${cs.slug}`,
  }));

  const pages = [...STATIC_PAGES, ...servicePages, ...sectionPages];

  return new Response(JSON.stringify({ pages }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
