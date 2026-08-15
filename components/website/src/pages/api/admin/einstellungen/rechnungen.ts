import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setSiteSetting } from '../../../../lib/website-db';
import { setTaxMode } from '../../../../lib/tax-monitor';

const STRING_KEYS = ['invoice_sender_name','invoice_sender_street','invoice_sender_city','invoice_sender_phone','invoice_bank_iban','invoice_bank_bic','invoice_bank_name','invoice_vat_id','invoice_manager'] as const;
const INT_KEYS = ['invoice_payment_days'] as const;

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const brand = process.env.BRAND || 'mentolder';

  const saves: Promise<void>[] = [];

  for (const key of STRING_KEYS) {
    saves.push(setSiteSetting(brand, key, (form.get(key) as string)?.trim() ?? ''));
  }
  for (const key of INT_KEYS) {
    const val = parseInt(form.get(key) as string, 10);
    saves.push(setSiteSetting(brand, key, isNaN(val) ? '0' : String(val)));
  }

  const rawMode = form.get('tax_mode') as string;
  // Steuersatz: bei Kleinunternehmer immer 0, sonst geparst aus Form (float, geklammert auf 0–100)
  const isKleinunternehmer = rawMode === 'kleinunternehmer';
  const rawRate = parseFloat(form.get('invoice_tax_rate') as string);
  const taxRate = isKleinunternehmer ? 0 : (isNaN(rawRate) ? 19 : Math.max(0, Math.min(100, rawRate)));
  saves.push(setSiteSetting(brand, 'invoice_tax_rate', String(taxRate)));

  if (rawMode === 'kleinunternehmer' || rawMode === 'regelbesteuerung') {
    saves.push(setTaxMode(brand, rawMode, { notes: 'Manuell geändert über Einstellungen' }));
  }

  await Promise.all(saves);
  return redirect('/admin/einstellungen/rechnungen?saved=1', 303);
};
