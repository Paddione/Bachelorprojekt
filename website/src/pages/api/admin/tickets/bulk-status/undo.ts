// website/src/pages/api/admin/tickets/bulk-status/undo.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { undoBulkStatus } from '../../../../../lib/bulk-status';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }

  const undoToken = body.undoToken as string | undefined;
  if (!undoToken) {
    return new Response(JSON.stringify({ error: 'undoToken is required' }), { status: 400 });
  }

  try {
    const result = await undoBulkStatus(undoToken);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'undo failed';
    const status = msg === 'Token not found or expired' ? 410 : 400;
    return new Response(JSON.stringify({ error: msg }), { status });
  }
};
