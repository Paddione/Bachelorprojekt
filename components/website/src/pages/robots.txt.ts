import type { APIRoute } from 'astro';
import { siteOrigin } from '../lib/site-origin';

// Dynamisch statt public/robots.txt: die Sitemap-URL folgt der Instanz (web.mentolder.de, massage.<domain>).
export const GET: APIRoute = () => {
  const origin = siteOrigin() || 'https://web.localhost';
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
