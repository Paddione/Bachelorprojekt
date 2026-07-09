// tests/e2e/lib/e2e-seed.ts
//
// DB-level E2E seed helpers (companion to e2e-marker.ts).
//
// Background
// ──────────
// The `e2e-marker.ts` helper (`createTestBugReport`) seeds tickets via
// POST /api/bug-report. That requires a running website pod, traverses
// the full request pipeline, and is fragile against rate limits /
// network flaps / new schema columns (e.g. `is_test_data` was added in
// T000862 and `external_id` switched from `BR-*` to `T*`).
//
// These helpers instead INSERT directly into `tickets.tickets` using a
// `pg.Pool` — same pattern as `fa-fragebogen.spec.ts` (T000703). The
// seeded rows carry `is_test_data = true`, so:
//
//   1. The server-side `tickets.fn_purge_test_data()` scheduled sweep
//      (admin/systemtest/cleanup-fixtures.ts) deletes them at the next
//      bracket — no test-leftovers even if the runner crashes mid-test.
//   2. A test-level `cleanupSeedTicket()` in `afterEach` / `afterAll`
//      removes the rows immediately so the next test starts clean.
//
// Gating
// ──────
// `seedAvailable()` mirrors `markerAvailable()` and returns true only
// when BOTH `CRON_SECRET` (prod-pollution guard) and
// `SESSIONS_DATABASE_URL` (direct-DB access) are set. The two together
// are the contract every other DB-level seed in this repo follows.
//
// Tests that need to seed MUST call `test.skip(!seedAvailable(), ...)`
// before doing any DB work.

import { Pool } from 'pg';

const DB_URL = process.env.SESSIONS_DATABASE_URL
            ?? 'postgresql://website:devwebsitedb@localhost:5432/website';
const BRAND  = process.env.E2E_BRAND ?? 'mentolder';

/** True only when both the prod-pollution guard and the DB URL are set. */
export function seedAvailable(): boolean {
  return !!process.env.CRON_SECRET && !!process.env.SESSIONS_DATABASE_URL;
}

/** A short, deterministic-ish reporter tag for E2E-seeded tickets. */
function seededReporter(testId: string): string {
  return `e2e-admin-tickets-${testId}@example.com`;
}

export interface SeedAdminTicketInput {
  /** Short suffix used in title, reporter email, and description. */
  testId: string;
  /** Ticket status. Defaults to 'triage' (matches the bug-report endpoint). */
  status?: 'triage' | 'backlog' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'archived';
  /** Optional override for `description`. */
  description?: string;
  /** Optional override for `url` (provenance). */
  url?: string;
  /** Optional override for the reporter email. */
  reporterEmail?: string;
  /** Set true to also stamp `is_test_data=true` on linked rows. Default true. */
  isTestData?: boolean;
}

export interface SeededTicket {
  id: string;
  externalId: string;
  reporterEmail: string;
}

/**
 * Inserts a `tickets.tickets` row directly via SQL. Returns the new
 * ticket's UUID + T-number so the caller can drive the admin UI
 * against it. The `is_test_data` flag is set so the server-side purge
 * function sweeps the row at the next bracket — AND so a `cleanup*`
 * call in `afterEach` is the only routine path that touches it.
 */
export async function seedAdminTicket(input: SeedAdminTicketInput): Promise<SeededTicket> {
  if (!seedAvailable()) {
    throw new Error('seedAdminTicket ohne CRON_SECRET+SESSIONS_DATABASE_URL — Aufrufer muss vorher seedAvailable() skippen');
  }
  const pool = new Pool({ connectionString: DB_URL });
  try {
    const reporter = input.reporterEmail ?? seededReporter(input.testId);
    const status   = input.status ?? 'triage';
    const descr    = input.description ?? `PR4 admin-tickets E2E seed (${input.testId})`;
    const url      = input.url ?? '/admin/tickets-e2e';
    const isTest   = input.isTestData !== false;
    const { rows } = await pool.query<{ id: string; external_id: string }>(
      `INSERT INTO tickets.tickets
         (type, brand, title, description, url, reporter_email, status, is_test_data)
       VALUES ('bug', $1, $2, $3, $4, $5, $6, $7)
       RETURNING id, external_id`,
      [BRAND, `[E2E] ${input.testId}`, descr, url, reporter, status, isTest],
    );
    if (rows.length === 0) throw new Error('seedAdminTicket INSERT returned no row');
    return { id: rows[0].id, externalId: rows[0].external_id, reporterEmail: reporter };
  } finally {
    await pool.end();
  }
}

/**
 * Adds a `tickets.ticket_comments` row to an existing ticket. Used by
 * tests that want to assert the timeline renders the comment they
 * already expect, without having to round-trip through the API.
 */
export interface SeedCommentInput {
  ticketId: string;
  authorLabel: string;
  body: string;
  visibility?: 'internal' | 'public';
  kind?: 'comment' | 'status_change' | 'system';
}

export async function seedTicketComment(input: SeedCommentInput): Promise<{ id: number }> {
  if (!seedAvailable()) {
    throw new Error('seedTicketComment ohne CRON_SECRET+SESSIONS_DATABASE_URL — Aufrufer muss vorher seedAvailable() skippen');
  }
  const pool = new Pool({ connectionString: DB_URL });
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO tickets.ticket_comments
         (ticket_id, author_label, kind, body, visibility)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.ticketId, input.authorLabel, input.kind ?? 'comment',
       input.body, input.visibility ?? 'internal'],
    );
    return { id: Number(rows[0].id) };
  } finally {
    await pool.end();
  }
}

/**
 * Hard-deletes a seeded ticket by UUID. CASCADE wipes
 * `ticket_comments`, `ticket_activity`, and `ticket_links` linked to
 * it — so a single DELETE is enough to scrub the whole fixture.
 *
 * Safe to call in `afterEach` / `afterAll` even if the test skipped
 * (it just won't find the row).
 */
export async function cleanupSeedTicket(id: string): Promise<void> {
  if (!seedAvailable()) return; // Nothing to clean if we never seeded.
  const pool = new Pool({ connectionString: DB_URL });
  try {
    await pool.query(
      `DELETE FROM tickets.tickets WHERE id = $1 AND is_test_data = true`,
      [id],
    );
  } finally {
    await pool.end();
  }
}

/**
 * Like `cleanupSeedTicket` but takes a list of IDs — useful for
 * `afterAll` over a whole describe block.
 */
export async function cleanupSeedTickets(ids: ReadonlyArray<string>): Promise<void> {
  if (!seedAvailable() || ids.length === 0) return;
  const pool = new Pool({ connectionString: DB_URL });
  try {
    await pool.query(
      `DELETE FROM tickets.tickets
        WHERE id = ANY($1::uuid[]) AND is_test_data = true`,
      [ids],
    );
  } finally {
    await pool.end();
  }
}
