// website/src/pages/api/admin/inbox/count.ts
// Lightweight endpoint that returns the current pending counts grouped by
// inbox type plus the total. Used by the AdminLayout sidebar badge to
// stay in sync after a client-side action without re-fetching the full list.

import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { countPendingByType } from '../../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const counts = await countPendingByType();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return new Response(JSON.stringify({ counts, total }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
