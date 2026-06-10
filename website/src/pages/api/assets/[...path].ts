import type { APIRoute } from 'astro';
import { pool } from '../../../lib/website-db';
import { downloadFile } from '../../../lib/nextcloud-files';

export const GET: APIRoute = async ({ params }) => {
  const pathParts = params.path;
  if (!pathParts) {
    return new Response('Not Found', { status: 404 });
  }

  const filePath = Array.isArray(pathParts) ? pathParts.join('/') : pathParts;

  try {
    const result = await pool.query(
      `SELECT file_path, metadata FROM assets.registry WHERE file_path = $1`,
      [filePath],
    );

    if (result.rows.length === 0) {
      return new Response('Not Found', { status: 404 });
    }

    const row = result.rows[0];
    const ncPath = `EditorImages/${row.file_path.replace('editor-images/', '')}`;
    const buffer = await downloadFile(ncPath);

    const mime = row.metadata?.mime_type || 'application/octet-stream';

    return new Response(buffer, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
};
