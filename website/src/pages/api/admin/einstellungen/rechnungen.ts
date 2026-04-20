import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setSiteSetting } from '../../../../lib/website-db';

const STRING_KEYS = ['invoice_prefix','invoice_sender_name','invoice_sender_street','invoice_sender_city','invoice_bank_iban','invoice_bank_bic','invoice_bank_name'] as const;
const NUMBER_KEYS = ['invoice_payment_days','invoice_tax_rate'] as const;

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const brand = process.env.BRAND || 'mentolder';

  const saves: Promise<void>[] = [];

  for (const key of STRING_KEYS) {
    saves.push(setSiteSetting(brand, key, (form.get(key) as string)?.trim() ?? ''));
  }
  for (const key of NUMBER_KEYS) {
    const val = parseInt(form.get(key) as string, 10);
    saves.push(setSiteSetting(brand, key, isNaN(val) ? '0' : String(val)));
  }

  await Promise.all(saves);
  return redirect('/admin/einstellungen/rechnungen?saved=1', 303);
};
