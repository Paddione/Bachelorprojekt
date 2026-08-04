import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { serverLogBuffer } from '../../../../../lib/server-log-buffer';
import type { LogEntry } from '../../../../../lib/logging/log-types';

// Admin-gated SSE stream of the website server's own pino logs. Sends the ring
// buffer backlog on connect, then live entries as they are logged. Same auth
// pattern as the pod-log stream endpoint (401 for non-admins).
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (entry: LogEntry) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`));
        } catch {
          // Controller already closed (client gone) — stop pushing.
          unsubscribe?.();
          unsubscribe = null;
        }
      };
      for (const entry of serverLogBuffer.backlog()) send(entry);
      unsubscribe = serverLogBuffer.subscribe(send);
    },
    cancel() {
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
};
