// website/src/pages/api/admin/inbox.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listInboxItems, countPendingByType } from '../../../lib/messaging-db';
import type { InboxType, InboxStatus } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const status = (url.searchParams.get('status') as InboxStatus | null) ?? 'pending';
  const type = (url.searchParams.get('type') as InboxType | null) ?? undefined;
  // E2E-only escape hatch: test rows are hidden by default (T001456).
  const includeTest = url.searchParams.get('includeTest') === '1';

  const [items, counts] = await Promise.all([
    listInboxItems({ status, type, includeTest }),
    countPendingByType(),
  ]);

  return new Response(JSON.stringify({ items, counts }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
