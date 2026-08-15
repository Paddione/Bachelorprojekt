import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setSiteSetting } from '../../../../lib/website-db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const brand = process.env.BRAND || 'mentolder';

  const fromName    = (form.get('email_from_name')    as string)?.trim();
  const fromAddress = (form.get('email_from_address') as string)?.trim();

  if (!fromName) return new Response(JSON.stringify({ error: 'Absendername darf nicht leer sein' }), { status: 400 });
  if (!fromAddress || !EMAIL_RE.test(fromAddress)) return new Response(JSON.stringify({ error: 'Ungültige Absender-Adresse' }), { status: 400 });

  await Promise.all([
    setSiteSetting(brand, 'email_from_name',    fromName),
    setSiteSetting(brand, 'email_from_address', fromAddress),
  ]);

  return redirect('/admin/einstellungen/email?saved=1', 303);
};
