// POST /api/admin/systemtest/seed
//
// Body: { assignmentId: UUID, questionId: UUID }
//
// Looks up the seed module registered for (template, question) — falling
// back to a template-level row — runs it inside a single PG transaction
// guarded by a per-(assignment, question) advisory lock, then writes
// fixture-tracking rows for the cleanup CronJob.
//
// On any error inside the transaction we ROLLBACK and return 500. The
// fixtures are also rolled back, but Keycloak users created via the admin
// API are NOT — we attempt a best-effort `keycloak.deleteUser()` before
// surfacing the error so we don't leak users on partial failure.

import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';
import { getSession, isAdmin } from '../../../../lib/auth';
import * as keycloak from '../../../../lib/keycloak';
import authOnly from '../../../../lib/systemtest-seeds/auth-only';
import bookingFlow from '../../../../lib/systemtest-seeds/booking-flow';
import coachingProject from '../../../../lib/systemtest-seeds/coaching-project';
import livestreamViewer from '../../../../lib/systemtest-seeds/livestream-viewer';
import type { SeedFn, SeedRole } from '../../../../lib/systemtest/seed-context';

const REGISTRY: Record<string, SeedFn> = {
  'auth-only': authOnly,
  'booking-flow': bookingFlow,
  'coaching-project': coachingProject,
  'livestream-viewer': livestreamViewer,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Stable 32-bit hash of (assignmentId, questionId) used as the
 *  pg_advisory_xact_lock key so concurrent seeds for the same step block
 *  rather than race. */
function hashLockKey(a: string, b: string): number {
  const s = `${a}|${b}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return jsonError('Unauthorized', 401);
  }

  let body: { assignmentId?: string; questionId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError('bad json', 400);
  }
  const assignmentId = body.assignmentId;
  const questionId = body.questionId;
  if (!assignmentId || !questionId || !UUID_RE.test(assignmentId) || !UUID_RE.test(questionId)) {
    return jsonError('assignmentId and questionId must be UUIDs', 400);
  }

  // Look up the seed module via question-specific then template-level fallback.
  // Also pull `test_role` and the current `retest_attempt` (if a test_status
  // row exists yet — first seed has none).
  const meta = await pool.query(
    `SELECT q.test_role,
            t.id  AS template_id,
            qts.retest_attempt,
            COALESCE(reg_q.seed_module, reg_t.seed_module) AS seed_module
       FROM questionnaire_questions q
       JOIN questionnaire_templates t ON t.id = q.template_id
       JOIN questionnaire_assignments a ON a.template_id = t.id
       LEFT JOIN questionnaire_test_status qts
              ON qts.question_id = q.id
       LEFT JOIN questionnaire_test_seed_registry reg_q
              ON reg_q.template_id = t.id AND reg_q.question_id = q.id
       LEFT JOIN questionnaire_test_seed_registry reg_t
              ON reg_t.template_id = t.id AND reg_t.question_id IS NULL
      WHERE a.id = $1 AND q.id = $2`,
    [assignmentId, questionId],
  );
  if (meta.rows.length === 0) {
    return jsonError('assignment/question not found', 404);
  }
  const seedModule: string | null = meta.rows[0].seed_module;
  if (!seedModule) {
    return jsonError('no seed registered for this question or template', 404);
  }
  const fn = REGISTRY[seedModule];
  if (!fn) {
    return jsonError(`unknown seed module: ${seedModule}`, 500);
  }
  const role: SeedRole = (meta.rows[0].test_role as SeedRole | null) ?? 'customer';
  const attempt: number = meta.rows[0].retest_attempt ?? 0;

  const lockKey = hashLockKey(assignmentId, questionId);
  const client = await pool.connect();
  // Track Keycloak user IDs created during this seed so we can attempt
  // best-effort deletion if the SQL transaction is rolled back.
  const createdKeycloakUsers: string[] = [];
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockKey]);

    const result = await fn({
      assignmentId,
      questionId,
      attempt,
      role,
      db: client,
      keycloak: {
        async createUser(params) {
          const r = await keycloak.createUser(params);
          if (r.success && r.userId) createdKeycloakUsers.push(r.userId);
          return r;
        },
        deleteUser: keycloak.deleteUser,
      },
      track: async (table: string, rowId: string) => {
        await client.query(
          `INSERT INTO questionnaire_test_fixtures
             (assignment_id, question_id, attempt, table_name, row_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [assignmentId, questionId, attempt, table, rowId],
        );
      },
    });
    await client.query('COMMIT');
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    // Best-effort: tear down Keycloak users we created — the SQL
    // questionnaire_test_fixtures rows that would have tracked them rolled
    // back, so the cleanup CronJob will never see these IDs.
    for (const uid of createdKeycloakUsers) {
      await keycloak.deleteUser(uid).catch(() => {});
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[systemtest/seed] seed failed:', msg);
    return jsonError(`seed failed: ${msg}`, 500);
  } finally {
    client.release();
  }
};
