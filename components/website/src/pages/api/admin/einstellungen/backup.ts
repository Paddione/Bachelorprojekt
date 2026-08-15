import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setSiteSetting } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const brand = process.env.BRAND || 'mentolder';

  const filenUploadPath = (form.get('filen_upload_path') as string)?.trim();

  if (!filenUploadPath) return new Response(JSON.stringify({ error: 'Upload-Pfad darf nicht leer sein' }), { status: 400 });
  if (!filenUploadPath.startsWith('/')) return new Response(JSON.stringify({ error: 'Upload-Pfad muss mit / beginnen' }), { status: 400 });

  await setSiteSetting(brand, 'filen_upload_path', filenUploadPath);

  return redirect('/admin/einstellungen/backup?saved=1', 303);
};
