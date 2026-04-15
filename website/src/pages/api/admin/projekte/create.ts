import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createProject } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form = await request.formData();
  const brand       = form.get('brand')?.toString().trim()       ?? (process.env.BRAND || 'mentolder');
  const name        = form.get('name')?.toString().trim()        ?? '';
  const description = form.get('description')?.toString().trim() ?? '';
  const notes       = form.get('notes')?.toString().trim()       ?? '';
  const startDate   = form.get('startDate')?.toString()          ?? '';
  const dueDate     = form.get('dueDate')?.toString()            ?? '';
  const status      = form.get('status')?.toString()             || 'entwurf';
  const priority    = form.get('priority')?.toString()           || 'mittel';
  const customerId  = form.get('customerId')?.toString().trim()  ?? '';

  if (!name) {
    return Response.redirect(new URL('/admin/projekte?error=Name+ist+erforderlich', request.url), 303);
  }

  let id: string;
  try {
    id = await createProject({ brand, name, description, notes, startDate, dueDate, status, priority, customerId });
  } catch (err) {
    console.error('[projekte/create]', err);
    return Response.redirect(new URL('/admin/projekte?error=Datenbankfehler', request.url), 303);
  }

  return Response.redirect(new URL(`/admin/projekte/${id}?saved=1`, request.url), 303);
};
