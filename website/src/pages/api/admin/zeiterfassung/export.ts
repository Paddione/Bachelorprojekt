import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listAllTimeEntries } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const billableOnly = url.searchParams.get('billable') === 'true';
  const since        = url.searchParams.get('since') || undefined;

  const entries = await listAllTimeEntries({
    billable: billableOnly ? true : undefined,
    since,
  });

  const header = 'Datum,Projekt,Aufgabe,Beschreibung,Minuten,Stunden,Abrechenbar\n';
  const rows = entries.map(e => {
    const stunden = (e.minutes / 60).toFixed(2);
    const datum   = new Date(e.entryDate).toLocaleDateString('de-DE');
    const desc    = (e.description || '').replace(/"/g, '""');
    return `${datum},"${e.projectName}","${e.taskName || ''}","${desc}",${e.minutes},${stunden},${e.billable ? 'Ja' : 'Nein'}`;
  }).join('\n');

  return new Response(header + rows, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="zeiterfassung-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
};
