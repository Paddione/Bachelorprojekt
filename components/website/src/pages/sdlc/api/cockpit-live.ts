// components/website/src/pages/sdlc/api/cockpit-live.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { collectLiveFloor } from '../../../lib/sdlc/cockpit-live-source';

export const prerender = false;

// Read-only live floor without DB: gh + git + Plan-Frontmatter.
// Degrades to partial data with `degraded` notes — never fails the page.

export const GET: APIRoute = async ({ request }) => {
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

  const floor = await collectLiveFloor();
  return new Response(JSON.stringify(floor), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
