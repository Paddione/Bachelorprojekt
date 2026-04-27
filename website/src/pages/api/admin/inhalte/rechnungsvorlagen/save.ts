import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { setSiteSetting } from '../../../../../lib/website-db';

const ALLOWED_KEYS = [
  'invoice_intro_text',
  'invoice_kleinunternehmer_notice',
  'invoice_outro_text',
  'invoice_email_subject',
  'invoice_email_body',
] as const;

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const body = await request.json();
  await Promise.all(
    ALLOWED_KEYS.map(k => body[k] !== undefined ? setSiteSetting(brand, k, String(body[k])) : Promise.resolve())
  );
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
