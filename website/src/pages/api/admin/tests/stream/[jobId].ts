import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getJob } from '../../../../../lib/test-runner';

export const GET: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const job = getJob(params.jobId!);
  if (!job) {
    return new Response('Not Found', { status: 404 });
  }

  const encoder = new TextEncoder();
  const fmt = (event: string, data: string) =>
    encoder.encode(`event: ${event}\ndata: ${data}\n\n`);

  const stream = new ReadableStream({
    start(controller) {
      // Replay buffered events for late consumers
      for (const line of job.stdoutBuffer) {
        controller.enqueue(fmt('log', JSON.stringify({ line })));
      }
      for (const result of job.resultBuffer) {
        controller.enqueue(fmt('result', JSON.stringify(result)));
      }

      if (job.status !== 'running') {
        // Job already finished — send done immediately
        controller.enqueue(fmt('done', JSON.stringify({ summary: job.summary })));
        controller.close();
        return;
      }

      // Register listener for live events
      const listener = (event: string, data: string) => {
        controller.enqueue(fmt(event, data));
        if (event === 'done') {
          job.listeners.delete(listener);
          controller.close();
        }
      };
      job.listeners.add(listener);

      // Clean up if client disconnects
      request.signal.addEventListener('abort', () => {
        job.listeners.delete(listener);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
