// website/src/pages/api/factory/parallel-status.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { pool } from '../../../lib/website-db';
import {
  deriveParallelStatus,
  deriveNextTickAt,
  type ParallelStatusRow,
} from '../../../lib/parallel-status';

export const prerender = false;

function authGuard(session: Awaited<ReturnType<typeof getSession>>): Response | null {
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
  return null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;

  const slotsPerBrand = parseInt(process.env.FACTORY_SLOTS_PER_BRAND ?? '3', 10) || 3;
  const intervalSec = parseInt(process.env.FACTORY_TICK_INTERVAL_SEC ?? '300', 10) || 300;

  try {
    // Gang-Zustand: eine read-only Aggregatzeile (Muster aus scripts/factory/slots.sh:23).
    // ::int casts so pg returns numbers (bigint would arrive as string).
    const agg = await pool.query<ParallelStatusRow>(
      `SELECT
         COUNT(*) FILTER (
           WHERE slot_count > 1 AND pipeline_slot IS NOT NULL AND status = 'in_progress'
         )::int AS gang_tickets,
         COALESCE(SUM(slot_count) FILTER (
           WHERE pipeline_slot IS NOT NULL AND status = 'in_progress'
         ), 0)::int AS slots_claimed
       FROM tickets.tickets`,
    );

    // Eigene read-Query (readControl in factory-floor.ts ist modul-privat).
    const ctl = await pool.query<{ value: string }>(
      `SELECT value FROM tickets.factory_control WHERE key = $1 AND brand IS NULL LIMIT 1`,
      ['last-tick-at'],
    );
    const lastTickAt = ctl.rows[0]?.value ?? null;

    const nowISO = new Date().toISOString();
    const nextTickAt = deriveNextTickAt(lastTickAt, intervalSec, nowISO);
    const status = deriveParallelStatus(agg.rows[0], slotsPerBrand, nextTickAt);

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/factory/parallel-status] GET error:');
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
