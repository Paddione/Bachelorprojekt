import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { validateJsonEntries, ingestJsonChunks } from '../../../../../lib/ingest-json-core';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültige Form-Daten' }), { status: 400 });
  }

  const file = formData.get('file');
  const slug = (formData.get('slug') as string | null)?.trim();

  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug erforderlich' }), { status: 400 });
  }
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'file erforderlich' }), { status: 400 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch (err) {
    return new Response(JSON.stringify({ error: `JSON-Fehler: ${err instanceof Error ? err.message : err}` }), { status: 422 });
  }

  let entries: ReturnType<typeof validateJsonEntries>;
  try {
    entries = validateJsonEntries(raw);
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 422 });
  }

  const pool = new Pool({
    connectionString:
      process.env.SESSIONS_DATABASE_URL
      || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website',
  });

  const encoder = new TextEncoder();
  const sse = (data: object) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(sse({ type: 'start', total: entries.length }));
      try {
        const result = await ingestJsonChunks(
          pool,
          { entries, slug, sourceUri: `file://${file.name}` },
          (done, total) => {
            controller.enqueue(sse({ type: 'progress', done, total }));
          },
        );
        controller.enqueue(sse({ type: 'done', ...result, slug }));
      } catch (err) {
        controller.enqueue(sse({ type: 'error', message: err instanceof Error ? err.message : String(err) }));
      } finally {
        controller.close();
        await pool.end();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
