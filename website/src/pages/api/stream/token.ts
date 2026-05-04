// website/src/pages/api/stream/token.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { createViewerToken, createPublisherToken } from '../../../lib/livekit-token';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devlivekit';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devlivekitsecret1234567890abcdef';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tokenFn = isAdmin(session) ? createPublisherToken : createViewerToken;
  const jwt = await tokenFn(session.sub, session.name, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  return new Response(JSON.stringify({ token: jwt }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
