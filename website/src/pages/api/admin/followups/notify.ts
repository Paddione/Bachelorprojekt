import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getDueFollowUps } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const due = await getDueFollowUps();
  if (due.length === 0) {
    return Response.json({ sent: false, message: 'Keine fälligen Follow-ups.' });
  }

  console.log(`[followups] ${due.length} due follow-up(s)`);

  return Response.json({ sent: true, count: due.length });
};
