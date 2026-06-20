// website/src/pages/api/admin/tickets/bulk-status.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { bulkChangeStatus } from '../../../../lib/bulk-status';
import { isValidStatus } from '../../../../lib/tickets/transition';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }

  const ticketIds = body.ticketIds as string[] | undefined;
  const status = body.status as string | undefined;

  if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
    return new Response(JSON.stringify({ error: 'ticketIds is required and must be a non-empty array' }), { status: 400 });
  }

  if (!status || !isValidStatus(status)) {
    return new Response(JSON.stringify({ error: 'valid status is required' }), { status: 400 });
  }

  try {
    const result = await bulkChangeStatus(BRAND(), ticketIds, status, {
      label: session.preferred_username,
    });
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'bulk change failed';
    const status = msg === 'BATCH_LIMIT_EXCEEDED' ? 400 : 500;
    return new Response(JSON.stringify({ error: msg }), { status });
  }
};
