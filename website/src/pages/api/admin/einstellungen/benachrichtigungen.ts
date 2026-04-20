import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setSiteSetting } from '../../../../lib/website-db';

const TOGGLE_KEYS = ['notify_registration', 'notify_booking', 'notify_contact', 'notify_bug', 'notify_message', 'notify_followup'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const brand = process.env.BRAND || 'mentolder';

  const email = (form.get('notification_email') as string)?.trim();
  if (!email || !EMAIL_RE.test(email)) {
    return new Response(JSON.stringify({ error: 'Ungültige E-Mail-Adresse' }), { status: 400 });
  }

  await setSiteSetting(brand, 'notification_email', email);

  for (const key of TOGGLE_KEYS) {
    const val = form.get(key) === 'true' ? 'true' : 'false';
    await setSiteSetting(brand, key, val);
  }

  return redirect('/admin/einstellungen/benachrichtigungen?saved=1', 303);
};
