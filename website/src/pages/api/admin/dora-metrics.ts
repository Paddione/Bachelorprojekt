import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { pool } from '../../../lib/website-db';
import { computeDora } from '../../../lib/dora-metrics';
import type { DoraDeliveryRow } from '../../../lib/dora-metrics';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function resolveWindow(w: string): { interval: string; days: number; label: string } {
  switch (w) {
    case '30d': return { interval: "INTERVAL '30 days'", days: 30, label: '30d' };
    case '90d': return { interval: "INTERVAL '90 days'", days: 90, label: '90d' };
    case 'all': return { interval: "INTERVAL '9999 days'", days: 0, label: 'all' };
    default:    return { interval: "INTERVAL '7 days'", days: 7, label: '7d' };
  }
}

function toRow(r: Record<string, unknown>): DoraDeliveryRow {
  return {
    ticketId: r.ticket_id as string,
    type: r.type as string,
    driver: (r.driver ?? null) as DoraDeliveryRow['driver'],
    createdAt: (r.created_at ?? null) as string | null,
    mergedAt: (r.merged_at ?? null) as string | null,
    prNumber: (r.pr_number ?? null) as number | null,
    reverted: r.reverted === true || r.reverted === 'reverted',
  };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { interval, days, label } = resolveWindow(new URL(request.url).searchParams.get('window') ?? '7d');

  try {
    // Unified across drivers (G3): all done feature/task tickets with a merged PR,
    // plus the latest phase-event driver (NULL → counts as factory). pr_events gives
    // merged_at + reverted. Bug rows are fetched separately for MTTR + CFR bug term.
    const [mergesRes, bugsRes] = await Promise.all([
      pool.query(
        `SELECT t.external_id AS ticket_id, t.type, dv.driver,
                t.created_at, pe.merged_at, l.pr_number,
                (pe.status = 'reverted') AS reverted
           FROM tickets.tickets t
           JOIN tickets.ticket_links l ON l.from_id = t.id AND l.kind = 'pr' AND l.pr_number IS NOT NULL
           JOIN tickets.pr_events pe ON pe.pr_number = l.pr_number
           LEFT JOIN LATERAL (
             SELECT driver FROM tickets.factory_phase_events
              WHERE ticket_id = t.id ORDER BY at DESC LIMIT 1
           ) dv ON true
          WHERE t.type IN ('feature','task') AND t.status = 'done'
            AND t.done_at >= now() - ${interval}
          ORDER BY t.done_at DESC LIMIT 500`,
      ),
      pool.query(
        // MTTR source: type='bug' tickets with their own fixes self-link (PR-attachment).
        // kind='fixes' is a self-link (from_id = ticket, pr_number = closing PR) — NOT
        // a "behebt-Bug" signal. Used here only to find the closing PR's merged_at.
        `SELECT t.external_id AS ticket_id, t.type, dv.driver,
                t.created_at, pe.merged_at, l.pr_number, false AS reverted
           FROM tickets.tickets t
           JOIN tickets.ticket_links l ON l.from_id = t.id AND l.kind = 'fixes' AND l.pr_number IS NOT NULL
           JOIN tickets.pr_events pe ON pe.pr_number = l.pr_number
           LEFT JOIN LATERAL (
             SELECT driver FROM tickets.factory_phase_events
              WHERE ticket_id = t.id ORDER BY at DESC LIMIT 1
           ) dv ON true
          WHERE t.type = 'bug' AND t.status = 'done'
            AND t.done_at >= now() - ${interval}
          ORDER BY t.done_at DESC LIMIT 500`,
      ),
    ]);

    const merges = (mergesRes.rows as Record<string, unknown>[]).map(toRow);
    const bugs = (bugsRes.rows as Record<string, unknown>[]).map(toRow);
    const metrics = computeDora(merges, bugs, days, label);

    return json({ metrics }, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/dora-metrics] error:');
    return json({ error: 'fetch_failed' }, 500);
  }
};
