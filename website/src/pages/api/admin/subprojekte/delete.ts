import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { deleteSubProject } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form = await request.formData();
  const id   = form.get('id')?.toString().trim() ?? '';
  const back = form.get('_back')?.toString()      || '/admin/projekte';

  if (!id) {
    return Response.redirect(new URL(`${back}?error=ID+fehlt`, request.url), 303);
  }

  try {
    await deleteSubProject(id);
  } catch (err) {
    console.error('[subprojekte/delete]', err);
    return Response.redirect(new URL(`${back}?error=Datenbankfehler`, request.url), 303);
  }

  return Response.redirect(new URL(back, request.url), 303);
};
