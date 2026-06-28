import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getEnabled, getAll, setEnabled } from '../../../../lib/agent-push-settings';
import { errorResponse } from '../../_errors';

export const prerender = false;

async function checkAuth(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const expectedToken = process.env.AGENT_PUSH_TOKEN || 'dev-agent-push-token-1234567890';
    if (token === expectedToken) {
      return true;
    }
  }

  const session = await getSession(request.headers.get('cookie'));
  if (session && isAdmin(session)) {
    return true;
  }

  return false;
}

export const GET: APIRoute = async ({ request, locals }) => {
  if (!(await checkAuth(request))) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const source = url.searchParams.get('source');

    if (source === 'opencode' || source === 'agy') {
      const enabled = await getEnabled(source as 'opencode' | 'agy');
      return new Response(JSON.stringify({ enabled }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const settings = await getAll();
    return new Response(JSON.stringify(settings), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    locals.requestLogger.error({ err }, '[agent-push settings GET]');
    return errorResponse('AGENT_PUSH_SETTINGS_GET_FAILED', locals.requestId, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!(await checkAuth(request))) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = await request.json();
    const { source, enabled } = body;

    if (source !== 'opencode' && source !== 'agy') {
      return new Response('Bad Request: invalid source', { status: 400 });
    }
    if (typeof enabled !== 'boolean') {
      return new Response('Bad Request: enabled must be a boolean', { status: 400 });
    }

    await setEnabled(source, enabled);
    const settings = await getAll();
    return new Response(JSON.stringify(settings), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    locals.requestLogger.error({ err }, '[agent-push settings POST]');
    return errorResponse('AGENT_PUSH_SETTINGS_POST_FAILED', locals.requestId, 500);
  }
};
