import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createSubProject } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form       = await request.formData();
  const projectId  = form.get('projectId')?.toString().trim()   ?? '';
  const name       = form.get('name')?.toString().trim()        ?? '';
  const description = form.get('description')?.toString().trim() ?? '';
  const notes      = form.get('notes')?.toString().trim()       ?? '';
  const startDate  = form.get('startDate')?.toString()          ?? '';
  const dueDate    = form.get('dueDate')?.toString()            ?? '';
  const status     = form.get('status')?.toString()             || 'entwurf';
  const priority   = form.get('priority')?.toString()           || 'mittel';
  const customerId = form.get('customerId')?.toString().trim()  ?? '';
  const back       = form.get('_back')?.toString()              || '/admin/projekte';

  if (!projectId || !name) {
    return Response.redirect(new URL(`${back}?error=Pflichtfelder+fehlen`, request.url), 303);
  }

  try {
    await createSubProject({ projectId, name, description, notes, startDate, dueDate, status, priority, customerId });
  } catch (err) {
    console.error('[subprojekte/create]', err);
    return Response.redirect(new URL(`${back}?error=Datenbankfehler`, request.url), 303);
  }

  return Response.redirect(new URL(back, request.url), 303);
};
