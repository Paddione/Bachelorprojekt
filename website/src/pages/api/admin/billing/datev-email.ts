import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getBookingsForPeriod, buildExtfCsv, periodRange } from '../../../../lib/datev-extf';
import { sendEmail } from '../../../../lib/email';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  let body: { year?: number; month?: number; to?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  const { year, month, to } = body;
  if (!year || typeof year !== 'number') return new Response('year required', { status: 400 });
  if (!to || typeof to !== 'string' || !to.includes('@')) return new Response('to (email) required', { status: 400 });

  const brand = process.env.BRAND || 'mentolder';
  const brandName = process.env.BRAND_NAME || brand;
  const { from, to: toDate, label } = periodRange(year, month);
  const records = await getBookingsForPeriod(brand, from, toDate);
  const csv = buildExtfCsv(records, {
    periodStart: from,
    periodEnd: toDate,
    fiscalYearStart: `${year}-01-01`,
    bezeichnung: `Buchungsstapel ${label}`,
  });

  const filename = `datev-buchungsstapel-${label.replace(/\s+/g, '-').toLowerCase()}.csv`;
  const ok = await sendEmail({
    to,
    subject: `DATEV Buchungsstapel ${label} — ${brandName}`,
    text: `Sehr geehrte/r Steuerberater/in,

anbei der DATEV Buchungsstapel für den Zeitraum ${label} (${records.length} Buchung${records.length !== 1 ? 'en' : ''}).

Die Datei kann direkt in DATEV importiert werden (Extras → Datenimport → Buchungsdatenservice).

Mit freundlichen Grüßen
${brandName}`,
    attachments: [{ filename, content: Buffer.from(csv, 'utf-8') }],
  });

  if (!ok) return new Response(JSON.stringify({ error: 'Email konnte nicht gesendet werden' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({ sent: true, count: records.length, to, filename }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
