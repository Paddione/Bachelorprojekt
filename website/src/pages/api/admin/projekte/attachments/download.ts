import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getProjectAttachment } from '../../../../../lib/website-db';
import { downloadFile } from '../../../../../lib/nextcloud-files';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = url.searchParams.get('id') ?? '';
  if (!id) return new Response('Missing id', { status: 400 });

  let attachment;
  try {
    attachment = await getProjectAttachment(id);
  } catch (err) {
    console.error('[attachments/download] db', err);
    return new Response('Internal error', { status: 500 });
  }

  if (!attachment) return new Response('Not found', { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await downloadFile(attachment.ncPath);
  } catch (err) {
    console.error('[attachments/download] nc', err);
    return new Response('Download failed', { status: 502 });
  }

  const safeFilename = attachment.filename.replace(/["\r\n]/g, '_');

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
    },
  });
};
