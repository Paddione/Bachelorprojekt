import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getLearningSummary, getLearningProgress } from '../../../../lib/learning-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const brand = session.brand ?? 'mentolder';

  const [summary, items] = await Promise.all([
    getLearningSummary(session.sub, brand),
    getLearningProgress(session.sub, brand),
  ]);

  return new Response(
    JSON.stringify({
      done: summary.done,
      inProgress: summary.inProgress,
      total: summary.total,
      pct: summary.pct,
      lastActivity: summary.lastActivity,
      items: items.map(row => ({
        item_id: row.itemId,
        item_type: row.itemType,
        status: row.status,
        note: row.note,
        started_at: row.startedAt,
        completed_at: row.completedAt,
      })),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
