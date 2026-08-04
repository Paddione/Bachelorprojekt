import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { pool } from '../../../../../../lib/website-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const ticketId = String(params.id ?? '');
  const aid = String(params.aid ?? '');
  if (!ticketId || !aid) return new Response(null, { status: 400 });

  const BRAND = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

  const r = await pool.query<{
    data_url: string;
    filename: string;
    mime_type: string;
  }>(
    `SELECT a.data_url, a.filename, a.mime_type
       FROM tickets.ticket_attachments a
       JOIN tickets.tickets t ON t.id = a.ticket_id
      WHERE a.id = $1 AND a.ticket_id = $2 AND t.brand = $3
        AND a.data_url IS NOT NULL`,
    [aid, ticketId, BRAND],
  );

  if (r.rows.length === 0) return new Response(null, { status: 404 });

  const { data_url, filename, mime_type } = r.rows[0];
  const commaIdx = data_url.indexOf(',');
  if (commaIdx === -1) return new Response(null, { status: 500 });

  const binary = Buffer.from(data_url.slice(commaIdx + 1), 'base64');
  const safeFilename = encodeURIComponent(filename).replace(/%20/g, '+');

  return new Response(binary, {
    status: 200,
    headers: {
      'Content-Type': mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${safeFilename}`,
      'Content-Length': String(binary.length),
      'Cache-Control': 'private, no-store',
    },
  });
};
