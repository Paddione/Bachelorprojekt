// website/src/pages/api/admin/tickets/[id]/attachments.ts
//
// Multipart upload, ≤ 5 MB. Stored as data_url for v1 (matches what the public
// bug-report endpoint does). Nextcloud-backed uploads are deferred to v1.5.
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { addAttachment } from '../../../../../lib/tickets/admin';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const MAX_BYTES = 5 * 1024 * 1024;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('multipart/form-data')) {
    return new Response(JSON.stringify({ error: 'multipart required' }), { status: 400 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'file required' }), { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: `file too large (max ${MAX_BYTES} bytes)` }),
      { status: 413 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || 'application/octet-stream';
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

  try {
    const r = await addAttachment({
      brand: BRAND(),
      ticketId: id,
      filename: file.name || 'unnamed',
      mimeType: mime,
      dataUrl,
      fileSize: file.size,
      actor: { label: session.preferred_username },
    });
    return new Response(JSON.stringify({ ok: true, id: r.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'upload failed' }),
      { status: 400 });
  }
};
