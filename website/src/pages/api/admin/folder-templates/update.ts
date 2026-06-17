import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updateTemplate, validateStructure } from '../../../../lib/folder-templates-db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form = await request.formData();
  const brand = process.env.BRAND || 'mentolder';
  const id = form.get('id')?.toString().trim() ?? '';
  const name = form.get('name')?.toString().trim() ?? '';
  const isDefault = form.has('isDefault');
  const rawLines = form.get('folders')?.toString() ?? '';

  if (!id || !name) return redirect('/admin/einstellungen/ordner-templates?error=ID+und+Name+erforderlich', 303);

  const folders = rawLines.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const validation = validateStructure(folders);
  if (!validation.ok) {
    return redirect(`/admin/einstellungen/ordner-templates?error=${encodeURIComponent(validation.error ?? '')}`, 303);
  }

  try {
    await updateTemplate(brand, id, { name, folders: validation.folders!, isDefault });
  } catch (err) {
    console.error('[folder-templates/update]', err);
    return redirect('/admin/einstellungen/ordner-templates?error=DB-Fehler', 303);
  }

  return redirect('/admin/einstellungen/ordner-templates?saved=1', 303);
};
