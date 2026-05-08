import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from '../website-db';
import { ensureSystemtestSchema } from './db';

const dbAvailable = !!(process.env.DATABASE_URL || process.env.WEBSITE_DATABASE_URL || process.env.SESSIONS_DATABASE_URL);

describe.skipIf(!dbAvailable)('systemtest schema', () => {
  beforeAll(async () => {
    await ensureSystemtestSchema(pool);
  });

  it('creates questionnaire_test_evidence', async () => {
    const r = await pool.query(
      `SELECT to_regclass('public.questionnaire_test_evidence') AS t`,
    );
    expect(r.rows[0].t).toBe('questionnaire_test_evidence');
  });

  it('creates questionnaire_test_seed_registry', async () => {
    const r = await pool.query(
      `SELECT to_regclass('public.questionnaire_test_seed_registry') AS t`,
    );
    expect(r.rows[0].t).toBe('questionnaire_test_seed_registry');
  });

  it('creates questionnaire_test_fixtures', async () => {
    const r = await pool.query(
      `SELECT to_regclass('public.questionnaire_test_fixtures') AS t`,
    );
    expect(r.rows[0].t).toBe('questionnaire_test_fixtures');
  });

  it('creates systemtest_failure_outbox', async () => {
    const r = await pool.query(
      `SELECT to_regclass('public.systemtest_failure_outbox') AS t`,
    );
    expect(r.rows[0].t).toBe('systemtest_failure_outbox');
  });

  it('adds back-ref columns to questionnaire_test_status', async () => {
    const r = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='questionnaire_test_status'
       AND column_name IN ('evidence_id','last_failure_ticket_id','retest_pending_at','retest_attempt')`,
    );
    expect(r.rows.map((x: { column_name: string }) => x.column_name).sort()).toEqual(
      ['evidence_id', 'last_failure_ticket_id', 'retest_attempt', 'retest_pending_at'],
    );
  });

  it('adds source columns to tickets.tickets', async () => {
    const r = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='tickets' AND table_name='tickets'
       AND column_name IN ('source_test_assignment_id','source_test_question_id')`,
    );
    expect(r.rows.length).toBe(2);
  });

  it('creates v_systemtest_failure_board view', async () => {
    const r = await pool.query(
      `SELECT to_regclass('public.v_systemtest_failure_board') AS v`,
    );
    expect(r.rows[0].v).toBe('v_systemtest_failure_board');
  });

  it('creates retest trigger on tickets.tickets', async () => {
    const r = await pool.query(
      `SELECT tgname FROM pg_trigger WHERE tgname = 'tickets_resolution_retest'`,
    );
    expect(r.rows.length).toBe(1);
  });

  it('is idempotent', async () => {
    await ensureSystemtestSchema(pool);
    await ensureSystemtestSchema(pool);
  });
});
