// website/src/pages/api/admin/shortcuts/fetch-title.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';

// Private IP ranges (SSRF protection)
const PRIVATE_RANGES = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
  /^::ffff:/i,
  /^fc/i,
  /^fd/i,
  /^fe80/i,
];

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_RANGES.some(r => r.test(hostname));
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ title: '' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url') ?? '';

  if (!url.startsWith('https://')) {
    return new Response(JSON.stringify({ title: '' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return new Response(JSON.stringify({ title: '' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isPrivateHost(hostname)) {
    return new Response(JSON.stringify({ title: '' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdminBot/1.0)' },
    });
    clearTimeout(timeout);

    const html = await res.text();
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = match ? match[1].trim().slice(0, 80) : '';

    return new Response(JSON.stringify({ title }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ title: '' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
