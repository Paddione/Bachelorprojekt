import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { subscribe } from '../../../../lib/sdlc/cockpit-listen-hub';
import { STREAM_HEARTBEAT_MS } from '../../../../lib/factory-constants.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let beatTimer: ReturnType<typeof setInterval> | null = null;
  let unsub: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      unsub = subscribe((ev) => send(ev.domain, ev));
      beatTimer = setInterval(() => send('heartbeat', { t: Date.now() }), STREAM_HEARTBEAT_MS);

      const cleanup = () => {
        if (unsub) { unsub(); unsub = null; }
        if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      if (unsub) { unsub(); unsub = null; }
      if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
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
