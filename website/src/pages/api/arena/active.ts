import type { APIRoute } from 'astro';

const UPSTREAM = process.env.ARENA_WS_URL ?? 'http://localhost:8090';
// Strip the ws prefix if present — REST uses https + host w/o the ws path.
const UPSTREAM_HTTP = UPSTREAM.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? '';
  if (!auth) return new Response('unauthorised', { status: 401 });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastBody = '';
      let cancelled = false;

      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      const tick = async () => {
        if (cancelled) return;
        try {
          const res = await fetch(`${UPSTREAM_HTTP}/lobby/active`, {
            headers: { authorization: auth },
          });
          const body = res.ok ? await res.text() : JSON.stringify({ active: false });
          if (body !== lastBody) { send(body); lastBody = body; }
        } catch (e: any) {
          send(JSON.stringify({ active: false, error: e.message }));
        }
        setTimeout(tick, 2000);
      };

      send(JSON.stringify({ active: false })); // initial
      tick();

      request.signal.addEventListener('abort', () => {
        cancelled = true;
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      'connection': 'keep-alive',
    },
  });
};