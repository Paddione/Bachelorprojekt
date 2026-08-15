// website/src/pages/api/admin/einstellungen/upload-logo.ts
// Multipart upload for the brand logo on /admin/einstellungen/branding.
// Mirrors /api/admin/startseite/upload-portrait — returns a base64 data URL
// the client then writes into the brand_logo_url site setting.
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';

const MAX_SIZE = 1 * 1024 * 1024; // 1 MB — logos are usually <100 KB
const ALLOWED  = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiges Formular' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const file = form.get('file') as File | null;
  if (!file || typeof file === 'string') {
    return new Response(JSON.stringify({ error: 'Keine Datei übermittelt' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!ALLOWED.includes(file.type)) {
    return new Response(JSON.stringify({ error: 'Nur JPEG, PNG, WebP oder SVG erlaubt' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (file.size > MAX_SIZE) {
    return new Response(JSON.stringify({ error: 'Datei zu groß (max. 1 MB)' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const dataUrl = `data:${file.type};base64,${base64}`;

  return new Response(JSON.stringify({ src: dataUrl }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
