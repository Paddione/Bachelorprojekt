import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

function readStarter(filename: string): string | null {
  const candidates = [
    join(process.cwd(), 'src/lib/starters', filename),
    join(dirname(fileURLToPath(import.meta.url)), '../../../lib/starters', filename),
  ];
  for (const p of candidates) {
    try { return readFileSync(p, 'utf-8'); } catch { /* try next */ }
  }
  return null;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const brand = process.env.BRAND || 'mentolder';
  const html = readStarter(`contract-${brand}.html`);
  if (!html) return new Response('Starter not found', { status: 404 });

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
