import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { deleteProjectAttachmentRecord } from '../../../../../lib/website-db';
import { deleteFile } from '../../../../../lib/nextcloud-files';
import { siteRedirect } from '../../../../../lib/redirect';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form = await request.formData();
  const id   = form.get('id')?.toString().trim() ?? '';
  const back = form.get('_back')?.toString()      || '/admin/projekte';

  if (!id) return siteRedirect(`${back}?error=ID+fehlt`);

  try {
    const ncPath = await deleteProjectAttachmentRecord(id);
    if (ncPath) {
      // Best-effort: don't fail the request if Nextcloud delete errors
      deleteFile(ncPath).catch(err => console.error('[attachments/delete] nc', err));
    }
  } catch (err) {
    console.error('[attachments/delete] db', err);
    return siteRedirect(`${back}?error=Fehler+beim+Löschen`);
  }

  return siteRedirect(back);
};
