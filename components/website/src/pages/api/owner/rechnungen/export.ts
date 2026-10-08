import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../lib/owner-guard';
import { listInvoices } from '../../../../lib/invoices';

const BRAND_FALLBACK = process.env.BRAND || 'mentolder';

function csvCell(value: string): string {
  if (value.includes('"') || value.includes(';') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function isRealDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = day.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() + 1 === m && probe.getUTCDate() === d;
}

function fmtBetrag(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await requireOwner(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const brand = ownerBusiness(session).brand ?? BRAND_FALLBACK;
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get('from') ?? `${today.slice(0, 4)}-01-01`;
  const to = url.searchParams.get('to') ?? today;
  if (!isRealDay(from) || !isRealDay(to) || from > to) {
    return new Response(JSON.stringify({ error: 'Ungültiger Zeitraum.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let rows: Awaited<ReturnType<typeof listInvoices>>;
  try {
    rows = await listInvoices(brand);
  } catch (err) {
    locals.requestLogger.error({ err }, '[owner/rechnungen/export]');
    return new Response('Datenbankfehler', { status: 500 });
  }
  const inRange = rows.filter((inv) => inv.issueDate >= from && inv.issueDate <= to);
  const lines = [
    'Nummer;Datum;Kunde;Betrag;Status;Methode',
    ...inRange.map((inv) =>
      [inv.number, inv.issueDate, inv.customerName, fmtBetrag(inv.grossAmountCents),
        inv.status, inv.paymentMethod ?? ''].map(csvCell).join(';'),
    ),
  ];
  const csv = '\uFEFF' + lines.join('\r\n'); // BOM (U+FEFF) for Excel UTF-8
  const safeBrand = brand.replace(/[^a-zA-Z0-9]+/g, '-');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rechnungen-${safeBrand}-${from}-${to}.csv"`,
    },
  });
};
