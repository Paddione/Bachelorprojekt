import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import inventory from '../../../../data/test-inventory.json';
import { listLastTestStatusPerTest } from '../../../../lib/website-db';

interface InventoryEntry { id: string; file: string; category: string; kind: string; }

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const lastStatus = await listLastTestStatusPerTest();
  const statusMap = new Map(lastStatus.map(r => [r.testId, { status: r.status, lastRun: r.createdAt }]));

  const matrix = (inventory as InventoryEntry[]).map(entry => {
    const last = statusMap.get(entry.id);
    return { ...entry, lastStatus: last?.status ?? 'untested', lastRun: last?.lastRun ?? null };
  });

  return new Response(JSON.stringify({ count: matrix.length, matrix }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
