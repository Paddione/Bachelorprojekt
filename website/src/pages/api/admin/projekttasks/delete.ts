import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { deleteProjectTask } from '../../../../lib/website-db';
import { siteRedirect } from '../../../../lib/redirect';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form = await request.formData();
  const id   = form.get('id')?.toString().trim() ?? '';
  const back = form.get('_back')?.toString()      || '/admin/projekte';

  if (!id) {
    return siteRedirect(`${back}?error=ID+fehlt`);
  }

  try {
    await deleteProjectTask(id);
  } catch (err) {
    console.error('[projekttasks/delete]', err);
    return siteRedirect(`${back}?error=Datenbankfehler`);
  }

  return siteRedirect(back);
};
