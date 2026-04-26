import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createProjectAttachment } from '../../../../../lib/website-db';
import { ensureFolder, uploadFile } from '../../../../../lib/nextcloud-files';
import { siteRedirect } from '../../../../../lib/redirect';
import { randomUUID } from 'node:crypto';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form      = await request.formData();
  const projectId = form.get('projectId')?.toString().trim() ?? '';
  const file      = form.get('file') as File | null;
  const back      = form.get('_back')?.toString() || '/admin/projekte';

  if (!projectId || !file || !file.name || file.size === 0) {
    return siteRedirect(`${back}?error=Keine+Datei+ausgewählt`);
  }

  if (file.size > MAX_FILE_SIZE) {
    return siteRedirect(`${back}?error=Datei+zu+groß+(max+50+MB)`);
  }

  const attachmentId = randomUUID();
  const ncPath       = `Projects/${projectId}/${attachmentId}`;
  const mimeType     = file.type || 'application/octet-stream';

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await ensureFolder(`Projects/${projectId}`);
    await uploadFile(ncPath, buffer, mimeType);
    await createProjectAttachment({ projectId, filename: file.name, ncPath, mimeType, fileSize: file.size });
  } catch (err) {
    console.error('[attachments/upload]', err);
    return siteRedirect(`${back}?error=Upload+fehlgeschlagen`);
  }

  return siteRedirect(back);
};
