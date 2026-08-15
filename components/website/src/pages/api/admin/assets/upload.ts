import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';
import { ensureFolder, uploadFile } from '../../../../lib/nextcloud-files';

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

function sanitizeFilename(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  return normalized || 'file';
}

function getExt(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

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
    return new Response(JSON.stringify({ error: 'Nur JPEG, PNG oder WebP erlaubt' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (file.size > MAX_SIZE) {
    return new Response(JSON.stringify({ error: 'Datei zu groß (max. 10 MB)' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date();
  const monthFolder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const uuid = randomUUID();
  const ext = getExt(file.type);
  const originalName = sanitizeFilename(file.name);
  const ncFolder = `EditorImages/${monthFolder}`;
  const ncPath = `${ncFolder}/${uuid}.${ext}`;
  const filePath = `editor-images/${monthFolder}/${uuid}.${ext}`;

  try {
    await ensureFolder(ncFolder);
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadFile(ncPath, buffer, file.type);

    await pool.query(
      `INSERT INTO assets.registry (name, type, file_path, metadata)
       VALUES ($1, 'image', $2, $3)`,
      [originalName, filePath, JSON.stringify({
        original_name: file.name,
        size_bytes: file.size,
        mime_type: file.type,
      })],
    );

    return new Response(JSON.stringify({
      url: `/api/assets/${filePath}`,
      asset_id: uuid,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Upload fehlgeschlagen' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
