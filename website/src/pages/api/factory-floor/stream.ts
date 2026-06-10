import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { pool } from '../../../lib/website-db';
import { getPlanningCount } from '../../../lib/factory-floor';

export const prerender = false;

const POLL_MS = 5_000;
const HEARTBEAT_MS = 30_000;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let beatTimer: ReturnType<typeof setInterval> | null = null;
  let lastMax = '';

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const poll = async () => {
        try {
          const [phaseRow, planningCount] = await Promise.all([
            pool.query(`SELECT COALESCE(MAX(at)::text, '') AS m FROM tickets.factory_phase_events`),
            getPlanningCount(),
          ]);
          const m = phaseRow.rows[0]?.m ?? '';
          if (m && m !== lastMax) {
            lastMax = m;
            send('phase', { at: m, planningCount });
          }
        } catch {
          /* swallow — heartbeat keeps stream alive */
        }
      };

      // Prime lastMax so the first poll only fires on a *new* event, then start loops.
      void poll();
      pollTimer = setInterval(poll, POLL_MS);
      beatTimer = setInterval(() => send('heartbeat', { t: Date.now() }), HEARTBEAT_MS);

      const cleanup = () => {
        if (pollTimer) clearInterval(pollTimer);
        if (beatTimer) clearInterval(beatTimer);
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      if (pollTimer) clearInterval(pollTimer);
      if (beatTimer) clearInterval(beatTimer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
};
