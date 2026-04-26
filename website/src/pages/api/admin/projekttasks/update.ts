import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updateProjectTask } from '../../../../lib/website-db';
import { siteRedirect } from '../../../../lib/redirect';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form        = await request.formData();
  const id          = form.get('id')?.toString().trim()          ?? '';
  const name        = form.get('name')?.toString().trim()        ?? '';
  const description = form.get('description')?.toString().trim() ?? '';
  const notes       = form.get('notes')?.toString().trim()       ?? '';
  const startDate   = form.get('startDate')?.toString()          ?? '';
  const dueDate     = form.get('dueDate')?.toString()            ?? '';
  const status      = form.get('status')?.toString()             || 'entwurf';
  const priority    = form.get('priority')?.toString()           || 'mittel';
  const customerId  = form.get('customerId')?.toString().trim()  ?? '';
  const back        = form.get('_back')?.toString()              || '/admin/projekte';

  if (!id || !name) {
    return siteRedirect(`${back}?error=Pflichtfelder+fehlen`);
  }

  try {
    await updateProjectTask(id, { name, description, notes, startDate, dueDate, status, priority, customerId });
  } catch (err) {
    console.error('[projekttasks/update]', err);
    return siteRedirect(`${back}?error=Datenbankfehler`);
  }

  return siteRedirect(back);
};
