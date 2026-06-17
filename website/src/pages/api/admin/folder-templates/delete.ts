import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { deleteTemplate } from '../../../../lib/folder-templates-db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form = await request.formData();
  const brand = process.env.BRAND || 'mentolder';
  const id = form.get('id')?.toString().trim() ?? '';

  if (!id) return redirect('/admin/einstellungen/ordner-templates?error=ID+erforderlich', 303);

  try {
    const ok = await deleteTemplate(brand, id);
    if (!ok) {
      return redirect('/admin/einstellungen/ordner-templates?error=Standard-Template+kann+nicht+gel%F6scht+werden', 303);
    }
  } catch (err) {
    console.error('[folder-templates/delete]', err);
    return redirect('/admin/einstellungen/ordner-templates?error=DB-Fehler', 303);
  }

  return redirect('/admin/einstellungen/ordner-templates?saved=1', 303);
};
