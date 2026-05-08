// GET /api/admin/systemtest/board
//
// Powers the system-test failure kanban (Task 7).
//
// Reads from `v_systemtest_failure_board` (Task 1) and groups rows into the
// four columns the UI renders:
//   - open            — failure ticket exists, no fix-PR yet
//   - fix_in_pr       — failure ticket has a `fixes`/`fixed_by` link to a PR
//                       that has not been merged yet
//   - retest_pending  — ticket was resolved=fixed; the trg_systemtest_retest
//                       trigger stamped retest_pending_at
//   - green           — last_result='erfüllt' within 7 days
//
// We also surface the count of stuck outbox rows (retry_count >= 12) so the
// UI can warn admins when failure-bridge retries are giving up. The threshold
// matches the Task 8 cron's give-up budget.
//
// Auth: admin-only — same gating as sibling /api/admin/systemtest/seed.
import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';
import { getSession, isAdmin } from '../../../../lib/auth';

export type BoardColumn = 'open' | 'fix_in_pr' | 'retest_pending' | 'green';

export interface BoardRow {
  assignment_id: string;
  question_id: string;
  last_result: string | null;
  last_result_at: string | null;
  retest_pending_at: string | null;
  retest_attempt: number;
  evidence_id: string | null;
  last_failure_ticket_id: string | null;
  ticket_id: string | null;
  ticket_external_id: string | null;
  ticket_status: string | null;
  ticket_resolution: string | null;
  pr_number: number | null;
  pr_merged_at: string | null;
  column_key: BoardColumn | null;
}

export interface BoardResponse {
  columns: Record<BoardColumn, BoardRow[]>;
  undelivered: number;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const r = await pool.query<BoardRow>(
      `SELECT *
         FROM v_systemtest_failure_board
        ORDER BY last_result_at DESC NULLS LAST`,
    );

    const columns: Record<BoardColumn, BoardRow[]> = {
      open: [],
      fix_in_pr: [],
      retest_pending: [],
      green: [],
    };
    for (const row of r.rows) {
      const key = row.column_key;
      if (key && key in columns) {
        columns[key].push(row);
      }
    }

    // Outbox rows that have exhausted (≥12) retries — the failure-bridge
    // gave up enqueuing a ticket. Surfaced in the header so admins know to
    // intervene manually.
    const outbox = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM systemtest_failure_outbox WHERE retry_count >= 12`,
    );
    const undelivered = outbox.rows[0]?.n ?? 0;

    const body: BoardResponse = { columns, undelivered };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/systemtest/board] query failed:', msg);
    return new Response(JSON.stringify({ error: 'board query failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
