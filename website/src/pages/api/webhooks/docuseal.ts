import type { APIRoute } from 'astro';
import { markAssignmentCompleted } from '../../../lib/documents-db';

export const POST: APIRoute = async ({ request }) => {
  // DocuSeal sends: {"event_type": "submission.completed", "data": {"submitter": {"slug": "..."}}}
  const body = await request.json() as {
    event_type?: string;
    data?: { submitter?: { slug?: string } };
  };

  if (body.event_type === 'submission.completed' && body.data?.submitter?.slug) {
    await markAssignmentCompleted(body.data.submitter.slug).catch(err =>
      console.error('Webhook: markAssignmentCompleted failed:', err),
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
