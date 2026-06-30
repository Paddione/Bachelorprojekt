import type { APIRoute } from 'astro';
import { getEffectiveServices } from '../lib/content';
import { listCustomSections } from '../lib/website-db';

const PROD_DOMAIN = process.env.PROD_DOMAIN || 'localhost';
const DOMAIN = `web.${PROD_DOMAIN}`;

const STATIC_PATHS = ['/', '/kontakt', '/ueber-mich', '/leistungen', '/referenzen'];

export const GET: APIRoute = async () => {
  const services = await getEffectiveServices().catch(() => []);
  const customSections = await listCustomSections().catch(() => []);

  const servicePaths = services
    .filter((s) => !s.hidden)
    .map((s) => `/${s.slug}`);

  const sectionPaths = customSections.map((cs) => `/${cs.slug}`);

  const allPaths = [...STATIC_PATHS, ...servicePaths, ...sectionPaths];
  const baseUrl = `https://${DOMAIN}`;

  const urls = allPaths.map((path) => {
    const loc = path === '/' ? baseUrl : `${baseUrl}${path}`;
    return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${path === '/' ? '1.0' : '0.8'}</priority>\n  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
