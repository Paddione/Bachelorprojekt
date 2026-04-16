import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getMeetingDetail, assignMeeting } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return json({ error: 'Forbidden' }, 403);
  }
  const meeting = await getMeetingDetail(params.id!);
  if (!meeting) return json({ error: 'Not found' }, 404);
  return json(meeting, 200);
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return json({ error: 'Forbidden' }, 403);
  }

  let body: {
    customerName?: string;
    customerEmail?: string;
    meetingType?: string;
    projectId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  await assignMeeting(params.id!, body);
  const updated = await getMeetingDetail(params.id!);
  return json(updated, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
