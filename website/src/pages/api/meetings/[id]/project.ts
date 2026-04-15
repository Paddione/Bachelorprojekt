import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { assignMeetingToProject } from '../../../../lib/website-db';

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const meetingId = params.id;
  if (!meetingId) {
    return new Response(JSON.stringify({ error: 'Missing meeting ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { projectId?: string | null };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await assignMeetingToProject(meetingId, body.projectId ?? null);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[PATCH /api/meetings/[id]/project] DB error:', err);
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
