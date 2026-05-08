import type { APIRoute } from 'astro';
import { pool } from '../../../../../lib/website-db';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = params.id;
  if (!id || !UUID_RE.test(id)) {
    return new Response('bad id', { status: 400 });
  }

  const r = await pool.query(
    `SELECT replay_path FROM questionnaire_test_evidence WHERE id = $1`,
    [id],
  );
  if (r.rows.length === 0 || !r.rows[0].replay_path) {
    return new Response('not found', { status: 404 });
  }

  const nodeStream = createReadStream(r.rows[0].replay_path);
  // Convert Node.js Readable into a Web ReadableStream the Response constructor
  // can consume directly. Astro/Node serves either, but typing prefers the Web
  // form so this avoids a cast through any.
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson',
      'cache-control': 'private, no-store',
    },
  });
};
