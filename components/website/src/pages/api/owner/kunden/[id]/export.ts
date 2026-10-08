import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../../lib/owner-guard';
import { listInboxItems } from '../../../../../lib/messaging-db';
import { deriveClients } from '../../../../../lib/clients';

const BRAND_FALLBACK = process.env.BRAND || 'mentolder';

function csvCell(value: string): string {
  if (value.includes('"') || value.includes(';') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function decodeId(raw: string): string {
  try {
    return raw.includes('%') ? decodeURIComponent(raw) : raw;
  } catch {
    return raw;
  }
}

export const GET: APIRoute = async ({ request, params, locals }) => {
  const session = await requireOwner(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const brand = ownerBusiness(session).brand ?? BRAND_FALLBACK;
  const id = decodeId(params.id ?? '');
  if (!id.startsWith('mail:')) {
    return new Response(JSON.stringify({ error: 'Kunde nicht gefunden.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let clients: ReturnType<typeof deriveClients>;
  try {
    clients = deriveClients(await listInboxItems({ brand, type: 'booking' }));
  } catch (err) {
    locals.requestLogger.error({ err }, '[owner/kunden/export]');
    return new Response('Datenbankfehler', { status: 500 });
  }
  const client = clients.find((entry) => entry.id === id) ?? null;
  if (client === null) {
    return new Response(JSON.stringify({ error: 'Kunde nicht gefunden.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Two sections (German Excel convention, semicolon separator): Kontakt as
  // field/value pairs, Historie as chronological rows, oldest first.
  const lines = [
    'Feld;Wert',
    ['Name', client.name].map(csvCell).join(';'),
    ['E-Mail', client.email].map(csvCell).join(';'),
    ['Telefon', client.phone ?? ''].map(csvCell).join(';'),
    '',
    'Datum;Art;Zusammenfassung',
    ...client.history.map((entry) =>
      [entry.slotStart ?? '', entry.state, entry.serviceName ?? 'Terminanfrage'].map(csvCell).join(';'),
    ),
  ];
  const csv = '\uFEFF' + lines.join('\r\n'); // BOM for Excel UTF-8
  const date = new Date().toISOString().slice(0, 10);
  const safeId = client.id.replace(/[^a-zA-Z0-9]+/g, '-');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kunde-${safeId}-${date}.csv"`,
    },
  });
};
