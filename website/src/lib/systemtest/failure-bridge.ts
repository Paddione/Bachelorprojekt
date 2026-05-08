// website/src/lib/systemtest/failure-bridge.ts
//
// Auto-creates a `tickets.tickets` row of type='bug' when a system-test step
// is marked `nicht_erfüllt`, and back-references the failed step on the new
// ticket so the retest trigger (Task 1 / db.ts) can fire when the ticket is
// later resolved.
//
// Design notes:
//   - Best-effort: callers (notably `updateTestStatuses` in questionnaire-db)
//     SHOULD wrap the call in try/catch — if the bridge throws, the answer
//     save MUST still commit. On any failure path inside `openFailureTicket`,
//     we attempt to enqueue a retry row in `systemtest_failure_outbox` so
//     the Task 8 cron can pick it up later.
//   - Idempotency: if `questionnaire_test_status.last_failure_ticket_id` is
//     already set AND the referenced ticket's resolution is NOT 'fixed',
//     we return the existing id rather than creating a duplicate. Once a
//     fix has been applied AND the retest still fails, we DO want a fresh
//     ticket per the design — that's why we gate on resolution='fixed'
//     instead of a generic "open" check.
//   - Stale-row guard: the `questionnaire_test_status` row is keyed by
//     `question_id` only. A newer assignment for the same question can
//     overwrite the row; we only stamp `last_failure_ticket_id` if the
//     row's `last_assignment_id` still matches the failed assignment we
//     were called with.
//   - `is_system_test` filtering is performed inside this module via a
//     JOIN on `questionnaire_templates`. Callers can therefore invoke the
//     bridge unconditionally — non-system-test failures short-circuit and
//     return null. (This keeps the call site in `questionnaire-db.ts`
//     simple and avoids a second round-trip.)

import type { Pool } from 'pg';

export interface OpenFailureOpts {
  assignmentId: string;
  questionId: string;
  evidenceId?: string | null;
  /** Free-form tester note (typically the `details_text` from the answer). */
  details?: string | null;
}

interface QuestionContext {
  template_id: string;
  template_title: string;
  is_system_test: boolean;
  question_text: string;
  test_expected_result: string | null;
  position: number;
  last_assignment_id: string | null;
  last_failure_ticket_id: string | null;
}

/** Lazy-loaded; tests may have already invoked it. */
let ticketsSchemaInitPromise: Promise<void> | null = null;
async function ensureTicketsSchema(): Promise<void> {
  if (!ticketsSchemaInitPromise) {
    // Imported lazily to avoid a top-level circular import with website-db /
    // questionnaire-db (both pull in tickets-db). The dynamic import keeps
    // this module loadable from anywhere without triggering eager init.
    ticketsSchemaInitPromise = import('../tickets-db').then(m => m.initTicketsSchema());
  }
  return ticketsSchemaInitPromise;
}

/** Truncate to a max length and add a single ellipsis without breaking
 *  multi-byte characters mid-codepoint. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

function buildTitle(templateTitle: string, position: number, questionText: string): string {
  // Per Task 5 spec: "Systemtest: {template_title} — Q{position}: {question_text_truncated}"
  // Total title cap chosen at 200 chars (matches the `tickets.tickets.title` slice
  // used by `insertBugTicket` in website-db.ts).
  const truncatedQuestion = truncate(questionText.replace(/\s+/g, ' ').trim(), 80);
  const head = `Systemtest: ${templateTitle} — Q${position}: `;
  return truncate(head + truncatedQuestion, 200);
}

function buildDescription(opts: {
  expectedResult: string | null;
  details: string | null;
  evidenceId: string | null;
  assignmentId: string;
  publicBaseUrl: string;
}): string {
  const parts: string[] = [];
  if (opts.expectedResult && opts.expectedResult.trim()) {
    parts.push(`**Erwartetes Ergebnis:**\n${opts.expectedResult.trim()}`);
  }
  if (opts.details && opts.details.trim()) {
    parts.push(`**Tester-Notiz:**\n${opts.details.trim()}`);
  }
  if (opts.evidenceId) {
    parts.push(`**Replay:** ${opts.publicBaseUrl}/api/admin/evidence/${opts.evidenceId}/replay`);
  }
  parts.push(`**Assignment:** ${opts.publicBaseUrl}/admin/fragebogen/${opts.assignmentId}`);
  return parts.join('\n\n');
}

/** Resolve the public base URL the same way other modules do (PROD_DOMAIN
 *  via web.<domain> in prod, localhost fallback in dev). Kept in-module so
 *  the failure-bridge has no other runtime dependencies. */
function publicBaseUrl(): string {
  const domain = process.env.PROD_DOMAIN;
  if (domain) return `https://web.${domain}`;
  return 'http://web.localhost';
}

/**
 * Create a bug ticket for a failing system-test step (or return the existing
 * one if there is already an unresolved/non-fixed ticket for this step).
 *
 * Returns the ticket UUID, or `null` if the bridge short-circuited (e.g.
 * the question is not part of an `is_system_test` template, or the test
 * status row is on a newer assignment).
 *
 * Throws on unexpected DB errors so the caller can decide whether to
 * enqueue a retry via `enqueueOutboxRetry`.
 */
export async function openFailureTicket(
  pool: Pool,
  opts: OpenFailureOpts,
): Promise<string | null> {
  await ensureTicketsSchema();

  const ctxRes = await pool.query<QuestionContext>(
    `SELECT qt.id            AS template_id,
            qt.title         AS template_title,
            qt.is_system_test,
            qq.question_text,
            qq.test_expected_result,
            qq.position,
            ts.last_assignment_id,
            ts.last_failure_ticket_id
       FROM questionnaire_questions qq
       JOIN questionnaire_templates qt ON qt.id = qq.template_id
  LEFT JOIN questionnaire_test_status ts ON ts.question_id = qq.id
      WHERE qq.id = $1`,
    [opts.questionId],
  );
  if (ctxRes.rows.length === 0) return null;
  const ctx = ctxRes.rows[0];

  // Fire only for system-test templates. Defensive: callers MAY pass through
  // any failed step but we never tag non-system-test failures with a ticket.
  if (!ctx.is_system_test) return null;

  // Stale-row guard: the test_status row's last_assignment_id must match
  // the failure we were told about. If a newer assignment has overwritten
  // it, defer to that assignment's own follow-up (do not stamp).
  if (ctx.last_assignment_id && ctx.last_assignment_id !== opts.assignmentId) {
    return null;
  }

  // Idempotency: if there is already a failure ticket for this step that
  // hasn't been resolved as 'fixed', reuse it. Once a fix lands and the
  // retest fails again, the existing row's resolution is 'fixed' and we
  // open a fresh ticket for the new failure (per design).
  if (ctx.last_failure_ticket_id) {
    const existing = await pool.query<{ resolution: string | null }>(
      `SELECT resolution FROM tickets.tickets WHERE id = $1`,
      [ctx.last_failure_ticket_id],
    );
    if (existing.rows.length > 0 && existing.rows[0].resolution !== 'fixed') {
      // Update evidence_id if a fresh recording came in for the still-open
      // failure (re-marking a step nicht_erfüllt without a fix in between).
      if (opts.evidenceId) {
        await pool.query(
          `UPDATE questionnaire_test_status
              SET evidence_id = $1
            WHERE question_id = $2
              AND last_assignment_id = $3`,
          [opts.evidenceId, opts.questionId, opts.assignmentId],
        );
      }
      return ctx.last_failure_ticket_id;
    }
    // else: row exists but is resolved=fixed → fall through and create a
    // new ticket. Design: a regression-on-retest deserves its own ticket.
  }

  const brand = process.env.BRAND || 'mentolder';
  const title = buildTitle(ctx.template_title, ctx.position, ctx.question_text);
  const description = buildDescription({
    expectedResult: ctx.test_expected_result,
    details: opts.details ?? null,
    evidenceId: opts.evidenceId ?? null,
    assignmentId: opts.assignmentId,
    publicBaseUrl: publicBaseUrl(),
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.user_label', $1, true)`,
      ['systemtest:failure-bridge']);

    const insert = await client.query<{ id: string }>(
      `INSERT INTO tickets.tickets
         (type, brand, title, description, status,
          source_test_assignment_id, source_test_question_id, is_test_data)
       VALUES ('bug', $1, $2, $3, 'triage', $4, $5, false)
       RETURNING id`,
      [brand, title, description, opts.assignmentId, opts.questionId],
    );
    const ticketId = insert.rows[0].id;

    // Stamp the test_status row only when the assignment still matches.
    // (Defense-in-depth — we already filtered above, but the WHERE makes
    // this resilient to a concurrent overwrite between the SELECT and now.)
    await client.query(
      `UPDATE questionnaire_test_status
          SET last_failure_ticket_id = $1,
              evidence_id = COALESCE($2, evidence_id)
        WHERE question_id = $3
          AND last_assignment_id = $4`,
      [ticketId, opts.evidenceId ?? null, opts.questionId, opts.assignmentId],
    );

    await client.query('COMMIT');
    return ticketId;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Append (or refresh) a retry row in `systemtest_failure_outbox`. Called
 * from the answer-save / status-update path when `openFailureTicket` itself
 * threw, so the failure can be retried by the Task 8 cron without losing
 * the original answer commit.
 */
export async function enqueueOutboxRetry(
  pool: Pool,
  opts: { assignmentId: string; questionId: string; attempt: number; error: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO systemtest_failure_outbox
       (assignment_id, question_id, attempt, last_error, retry_count, retry_after, created_at)
     VALUES ($1, $2, $3, $4, 0, now() + INTERVAL '30 seconds', now())`,
    [opts.assignmentId, opts.questionId, opts.attempt, opts.error.slice(0, 4000)],
  );
}
