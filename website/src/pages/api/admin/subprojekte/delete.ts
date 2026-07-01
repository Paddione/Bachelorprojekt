import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { deleteSubProject } from '../../../../lib/projects-db';
import { siteRedirect } from '../../../../lib/redirect';

export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form = await request.formData();
  const id   = form.get('id')?.toString().trim() ?? '';
  const back = form.get('_back')?.toString()      || '/admin/projekte';

  if (!id) {
    return siteRedirect(`${back}?error=ID+fehlt`);
  }

  try {
    await deleteSubProject(id);
  } catch (err) {
    locals.requestLogger.error({ err }, '[subprojekte/delete]');
    return siteRedirect(`${back}?error=Datenbankfehler`);
  }

  return siteRedirect(back);
};
