import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { exportProjectsFlat } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const brand = url.searchParams.get('brand') || process.env.BRAND || 'mentolder';

  let rows: Awaited<ReturnType<typeof exportProjectsFlat>>;
  try {
    rows = await exportProjectsFlat(brand);
  } catch (err) {
    console.error('[projekte/export]', err);
    return new Response('Datenbankfehler', { status: 500 });
  }

  const headers = ['Typ','Projekt','Teilprojekt','Name','Status','Priorität','Kunde','Erfasst','Start','Fälligkeit','Beschreibung','Notizen'];

  function csvCell(v: string): string {
    if (v.includes('"') || v.includes(',') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  }

  const lines = [
    headers.join(','),
    ...rows.map(r => [
      r.typ, r.projekt, r.teilprojekt, r.name,
      r.status, r.prioritaet, r.kunde,
      r.erfasst, r.start, r.faelligkeit,
      r.beschreibung, r.notizen,
    ].map(csvCell).join(',')),
  ];

  const csv = '\uFEFF' + lines.join('\r\n'); // BOM for Excel UTF-8
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="projekte-${brand}-${date}.csv"`,
    },
  });
};
