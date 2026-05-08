// website/src/lib/systemtest/test-run-bridge.ts
//
// Auto-files a `tickets.tickets` row of type='bug' for each failing test in
// a Playwright JSON report or a `tests/runner.sh` JSONL stream. Bridges the
// SECOND failure surface — questionnaire failures continue to flow through
// `failure-bridge.ts`. Both bridges share `systemtest_failure_outbox` for
// best-effort retries.
//
// Idempotency contract:
//   - One ticket per (run_id, test_id). Lookup-then-insert is wrapped with
//     the partial unique index `tickets_one_open_per_test_run_test_uq` as
//     the race guard.
//   - Closed tickets (`status IN ('done','archived')`) are excluded from the
//     "exists open" check so a regression on a later run still opens a
//     fresh ticket.
//
// Test-data marker:
//   - `is_test_data` is always FALSE for test-run failures. The runner.sh
//     and Playwright suites are real-environment health probes, not seeded
//     fixtures. Hiding them with the test-data toggle would defeat the
//     point of the loop.
//
// Why a separate file:
//   - failure-bridge.ts is large, deeply tied to questionnaire_test_status,
//     and uses an entirely different dedup key (source_test_question_id).
//     A sibling file with its own `enqueueTestRunOutboxRetry` keeps both
//     paths legible.
//
// Outbox shape:
//   - The shared `systemtest_failure_outbox` table now distinguishes paths
//     via `source_kind` (`'questionnaire'` or `'test_run'`). For test_run
//     rows, run_id/test_id are required and assignment_id/question_id stay
//     NULL (enforced by the `outbox_keys_by_kind` CHECK).

import type { Pool } from 'pg';

export interface OpenTestRunFailureOpts {
  /** test_runs.id — TEXT primary key (UUID-shaped in practice). */
  runId: string;
  /** test_results.id — BIGSERIAL. Optional: missing for runner.sh paths
   *  that haven't yet inserted into test_results. */
  resultId?: number | null;
  /** Stable identifier for the failing test (e.g. spec-title :: test-title
   *  for Playwright, or `<TEST-ID>/<case>` for runner.sh). */
  testId: string;
  /** Human-readable test name for the ticket title. */
  name: string;
  /** Originating category — used for routing and shows up in the ticket
   *  description. */
  category?: 'FA' | 'SA' | 'NFA' | 'AK' | 'E2E' | 'BATS' | null;
  /** First-line error message (truncated to 1000 chars in the description). */
  error?: string | null;
  /** Optional file path of the failing spec. Useful for "open in editor". */
  filePath?: string | null;
  /** Where the run came from: `'github'` for nightly e2e, `'admin'` for
   *  admin-triggered runs, `'cli'` for runner.sh on a workstation. */
  source?: 'github' | 'admin' | 'cli' | null;
  /** GitHub Actions run id — populates the link in the ticket description
   *  when source='github'. */
  githubRunId?: string | null;
  /** Optional cluster label (mentolder|korczewski|dev). */
  cluster?: string | null;
}

/** Lazy-loaded; multiple modules may invoke this. */
let ticketsSchemaInitPromise: Promise<void> | null = null;
async function ensureTicketsSchema(): Promise<void> {
  if (!ticketsSchemaInitPromise) {
    ticketsSchemaInitPromise = import('../tickets-db').then(m => m.initTicketsSchema());
  }
  return ticketsSchemaInitPromise;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

function publicBaseUrl(): string {
  const domain = process.env.PROD_DOMAIN;
  if (domain) return `https://web.${domain}`;
  return 'http://web.localhost';
}

function buildTitle(name: string, category: string | null | undefined): string {
  const head = `Testfehler${category ? ` [${category}]` : ''}: `;
  return truncate(head + name.replace(/\s+/g, ' ').trim(), 200);
}

function buildDescription(opts: OpenTestRunFailureOpts): string {
  const parts: string[] = [];
  parts.push(`**Test:** ${opts.testId}`);
  if (opts.filePath) parts.push(`**Datei:** ${opts.filePath}`);
  if (opts.cluster) parts.push(`**Cluster:** ${opts.cluster}`);
  if (opts.category) parts.push(`**Kategorie:** ${opts.category}`);
  if (opts.error) {
    parts.push(`**Fehler:**\n\n\`\`\`\n${truncate(opts.error, 1000)}\n\`\`\``);
  }
  const baseUrl = publicBaseUrl();
  parts.push(`**Run:** ${baseUrl}/admin/tests/runs/${encodeURIComponent(opts.runId)}`);
  if (opts.source === 'github' && opts.githubRunId) {
    parts.push(
      `**GitHub Actions:** https://github.com/Paddione/Bachelorprojekt/actions/runs/${opts.githubRunId}`,
    );
  }
  return parts.join('\n\n');
}

/**
 * Find-or-create a bug ticket for a failing Playwright/runner.sh test.
 *
 * Returns the ticket UUID, or `null` if dedup found an existing open ticket
 * (the existing ticket id is still returned in that case — null is reserved
 * for "schema unavailable / silent skip").
 *
 * Throws on unexpected DB errors so the caller can decide whether to
 * enqueue a retry via `enqueueTestRunOutboxRetry`.
 */
export async function openTestRunFailureTicket(
  pool: Pool,
  opts: OpenTestRunFailureOpts,
): Promise<string | null> {
  await ensureTicketsSchema();

  // Dedup: any OPEN ticket for this (run_id, test_id) wins. The partial
  // unique index `tickets_one_open_per_test_run_test_uq` is the race guard.
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM tickets.tickets
      WHERE source_test_run_id = $1
        AND source_test_id     = $2
        AND status NOT IN ('done','archived')
      ORDER BY created_at DESC
      LIMIT 1`,
    [opts.runId, opts.testId],
  );
  if (existing.rows.length > 0) {
    const ticketId = existing.rows[0].id;
    // Refresh result_id linkage in case the second call learned the row id
    // after the first call inserted without one.
    if (opts.resultId != null) {
      await pool.query(
        `UPDATE tickets.tickets
            SET source_test_result_id = COALESCE(source_test_result_id, $1),
                updated_at = now()
          WHERE id = $2`,
        [opts.resultId, ticketId],
      );
    }
    return ticketId;
  }

  const brand = process.env.BRAND_ID || process.env.BRAND || 'mentolder';
  const title = buildTitle(opts.name, opts.category ?? null);
  const description = buildDescription(opts);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.user_label', $1, true)`,
      ['systemtest:test-run-bridge'],
    );

    // ON CONFLICT on the partial unique index: if a sibling concurrent
    // insert beat us, we resolve to the existing row's id by re-selecting.
    const insert = await client.query<{ id: string }>(
      `INSERT INTO tickets.tickets
         (type, brand, component, severity,
          title, description, status,
          source_test_run_id, source_test_result_id, source_test_id,
          is_test_data)
       VALUES ('bug', $1, 'systemtest', 'minor',
               $2, $3, 'triage',
               $4, $5, $6,
               false)
       ON CONFLICT (source_test_run_id, source_test_id)
         WHERE source_test_run_id IS NOT NULL
           AND source_test_id     IS NOT NULL
           AND status NOT IN ('done','archived')
       DO UPDATE SET
         source_test_result_id = COALESCE(EXCLUDED.source_test_result_id,
                                          tickets.tickets.source_test_result_id),
         updated_at = now()
       RETURNING id`,
      [brand, title, description,
       opts.runId, opts.resultId ?? null, opts.testId],
    );
    const ticketId = insert.rows[0].id;

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
 * Enqueue a retry row in `systemtest_failure_outbox` keyed on
 * (run_id, test_id). Picked up by the same 5-min cron drain that handles
 * questionnaire failures (see `cleanup.ts:drainOutbox`).
 */
export async function enqueueTestRunOutboxRetry(
  pool: Pool,
  opts: {
    runId: string;
    testId: string;
    resultId?: number | null;
    name: string;
    error?: string | null;
    filePath?: string | null;
    attempt?: number;
    failureMessage: string;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO systemtest_failure_outbox
       (source_kind, run_id, test_id, test_result_id, test_name,
        error_message, file_path,
        attempt, last_error, retry_count, retry_after, created_at)
     VALUES ('test_run', $1, $2, $3, $4,
             $5, $6,
             $7, $8, 0, now() + INTERVAL '5 minutes', now())`,
    [
      opts.runId,
      opts.testId,
      opts.resultId ?? null,
      opts.name.slice(0, 500),
      opts.error?.slice(0, 4000) ?? null,
      opts.filePath?.slice(0, 500) ?? null,
      opts.attempt ?? 0,
      opts.failureMessage.slice(0, 4000),
    ],
  );
}

/**
 * Best-effort wrapper used by callers that want fire-and-forget behaviour.
 * Catches any error and routes it through the outbox so the answer-save /
 * ingest-e2e response is never delayed by ticket creation.
 */
export async function safeOpenTestRunFailureTicket(
  pool: Pool,
  opts: OpenTestRunFailureOpts,
): Promise<string | null> {
  try {
    return await openTestRunFailureTicket(pool, opts);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    await enqueueTestRunOutboxRetry(pool, {
      runId: opts.runId,
      testId: opts.testId,
      resultId: opts.resultId ?? null,
      name: opts.name,
      error: opts.error ?? null,
      filePath: opts.filePath ?? null,
      attempt: 0,
      failureMessage: msg,
    }).catch((outboxErr) =>
      // Don't let outbox failures bubble — the caller's primary work
      // (saving test_results) must still succeed.
      console.error('[test-run-bridge] outbox enqueue failed:', outboxErr),
    );
    return null;
  }
}
