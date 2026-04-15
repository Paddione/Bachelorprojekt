import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createTimeEntry } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form = await request.formData();
  const projectId    = form.get('projectId') as string;
  const taskId       = form.get('taskId') as string | null;
  const description  = form.get('description') as string | null;
  const minutesRaw   = form.get('minutes') as string;
  const billable     = form.get('billable') === 'true';
  const entryDate    = form.get('entryDate') as string | null;
  const back         = form.get('_back') as string | null;

  const minutes = parseInt(minutesRaw, 10);
  if (!projectId || isNaN(minutes) || minutes <= 0) {
    const dest = back || '/admin/zeiterfassung';
    return new Response(null, {
      status: 302,
      headers: { Location: `${dest}?error=${encodeURIComponent('Ungültige Eingabe')}` },
    });
  }

  try {
    await createTimeEntry({
      projectId,
      taskId: taskId || undefined,
      description: description || undefined,
      minutes,
      billable,
      entryDate: entryDate || undefined,
    });
  } catch (err) {
    console.error('[api/zeiterfassung/create]', err);
    const dest = back || '/admin/zeiterfassung';
    return new Response(null, {
      status: 302,
      headers: { Location: `${dest}?error=${encodeURIComponent('Datenbankfehler')}` },
    });
  }

  const dest = back || '/admin/zeiterfassung';
  return new Response(null, { status: 302, headers: { Location: `${dest}?saved=1` } });
};
