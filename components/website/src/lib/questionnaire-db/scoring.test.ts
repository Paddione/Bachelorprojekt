import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const clientQ = vi.fn();
const connect = vi.fn();
const computeScores = vi.fn();
const openFailureTicket = vi.fn();
const enqueueOutboxRetry = vi.fn();

vi.mock('./schema', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: (...a: unknown[]) => connect(...a),
  },
}));
vi.mock('./queries', () => ({ getQAssignment: vi.fn() }));
vi.mock('../compute-scores', () => ({ computeScores: (...a: unknown[]) => computeScores(...a) }));
vi.mock('../systemtest/failure-bridge', () => ({
  openFailureTicket: (...a: unknown[]) => openFailureTicket(...a),
  enqueueOutboxRetry: (...a: unknown[]) => enqueueOutboxRetry(...a),
}));

import {
  autoEvaluateQAssignment,
  reopenQAssignment,
  updateTestStatuses,
  listTestStatusesForMonitoring,
  listArchivedScores,
  listEvidenceByAssignment,
  listTestStepAttempts,
  listQuestionsWithSuccessfulRecording,
} from './scoring';
import { getQAssignment } from './queries';

beforeEach(() => {
  query.mockReset();
  clientQ.mockReset();
  connect.mockReset();
  computeScores.mockReset();
  openFailureTicket.mockReset();
  enqueueOutboxRetry.mockReset();
  connect.mockResolvedValue({ query: (...a: unknown[]) => clientQ(...a), release: () => undefined });
});

describe('questionnaire-db/scoring', () => {
  describe('autoEvaluateQAssignment', () => {
    it('returns early when the assignment is missing', async () => {
      (getQAssignment as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await autoEvaluateQAssignment('a1');
      expect(connect).not.toHaveBeenCalled();
    });

    it('returns early when status is not "submitted"', async () => {
      (getQAssignment as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'a1', template_id: 't1', status: 'pending',
      });
      await autoEvaluateQAssignment('a1');
      expect(connect).not.toHaveBeenCalled();
    });

    it('commits the score rows and updates the assignment to "reviewed"', async () => {
      (getQAssignment as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'a1', template_id: 't1', status: 'submitted',
      });
      clientQ
        .mockResolvedValueOnce({ rowCount: 0 })                                    // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'd1', template_id: 't1', name: 'D1', position: 1, threshold_mid: 5, threshold_high: 9, score_multiplier: 1, created_at: '' }] })  // dims
        .mockResolvedValueOnce({ rows: [] })                                       // opts
        .mockResolvedValueOnce({ rows: [] })                                       // answers
        .mockResolvedValueOnce({ rowCount: 1 })                                    // INSERT score
        .mockResolvedValueOnce({ rowCount: 1 })                                    // UPDATE assignment
        .mockResolvedValueOnce({ rowCount: 0 });                                   // COMMIT
      computeScores.mockReturnValueOnce([{
        dimension_id: 'd1', final_score: 7,
        threshold_mid: 5, threshold_high: 9, level: 'high',
      }]);

      await autoEvaluateQAssignment('a1');

      const sqls = clientQ.mock.calls.map((c) => c[0] as string);
      expect(sqls.some((s) => s.includes('BEGIN'))).toBe(true);
      expect(sqls.some((s) => s.includes('COMMIT'))).toBe(true);
      expect(sqls.some((s) => s.includes('questionnaire_assignment_scores'))).toBe(true);
      expect(sqls.some((s) => s.includes("SET status = 'reviewed'"))).toBe(true);
    });

    it('rolls back and rethrows on error', async () => {
      (getQAssignment as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'a1', template_id: 't1', status: 'submitted',
      });
      clientQ
        .mockResolvedValueOnce({ rowCount: 0 })          // BEGIN
        .mockResolvedValueOnce({ rows: [] })             // dims
        .mockRejectedValueOnce(new Error('db down'))     // opts query fails
        .mockResolvedValueOnce({ rowCount: 0 });         // ROLLBACK (best-effort)
      await expect(autoEvaluateQAssignment('a1')).rejects.toThrow(/db down/);
      const sqls = clientQ.mock.calls.map((c) => c[0] as string);
      expect(sqls.some((s) => s.includes('ROLLBACK'))).toBe(true);
    });
  });

  describe('reopenQAssignment', () => {
    it('returns not_found when no row exists', async () => {
      clientQ
        .mockResolvedValueOnce({ rowCount: 0 })        // BEGIN
        .mockResolvedValueOnce({ rows: [] });          // SELECT FOR UPDATE
      const out = await reopenQAssignment('a1');
      expect(out).toEqual({ reason: 'not_found' });
    });

    it('returns not_reopenable for status pending / in_progress', async () => {
      clientQ
        .mockResolvedValueOnce({ rowCount: 0 })        // BEGIN
        .mockResolvedValueOnce({ rows: [{ template_id: 't1', status: 'pending' }] });
      const out = await reopenQAssignment('a1');
      expect(out).toEqual({ reason: 'not_reopenable', status: 'pending' });
    });

    it('resets the assignment, deletes answers, bumps retest_attempt', async () => {
      (getQAssignment as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'a1', customer_id: 'c1', template_id: 't1', template_title: 'T', status: 'pending',
        coach_notes: '', assigned_at: '', submitted_at: null, reviewed_at: null,
        archived_at: null, dismissed_at: null, dismiss_reason: null, project_id: null,
      });
      clientQ
        .mockResolvedValueOnce({ rowCount: 0 })        // BEGIN
        .mockResolvedValueOnce({ rows: [{ template_id: 't1', status: 'submitted' }] })  // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 1 })        // UPDATE assignment
        .mockResolvedValueOnce({ rowCount: 2 })        // DELETE answers
        .mockResolvedValueOnce({ rowCount: 3 })        // bump test_status
        .mockResolvedValueOnce({ rowCount: 0 });       // COMMIT
      const out = await reopenQAssignment('a1');
      expect('assignment' in out).toBe(true);
      if ('assignment' in out) {
        expect(out.assignment.id).toBe('a1');
        expect(out.testStatusBumped).toBe(3);
      }
    });
  });

  describe('updateTestStatuses', () => {
    it('returns early when no test_step answers exist', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await updateTestStatuses('a1');
      const inserts = query.mock.calls.filter((c) => (c[0] as string).includes('INSERT INTO questionnaire_test_status'));
      expect(inserts).toHaveLength(0);
    });

    it('upserts test_status row and opens a failure ticket on nicht_erfüllt', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ question_id: 'q1', option_key: 'nicht_erfüllt', saved_at: new Date(), details_text: 'broken' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'ev1', attempt: 1 }] });
      openFailureTicket.mockResolvedValueOnce(undefined);

      await updateTestStatuses('a1');

      const insertSql = query.mock.calls.find((c) => (c[0] as string).includes('INSERT INTO questionnaire_test_status'));
      expect(insertSql).toBeTruthy();
      expect(openFailureTicket).toHaveBeenCalledTimes(1);
      const call = openFailureTicket.mock.calls[0][1] as Record<string, unknown>;
      expect(call.assignmentId).toBe('a1');
      expect(call.questionId).toBe('q1');
      expect(call.evidenceId).toBe('ev1');
    });

    it('enqueues an outbox retry when openFailureTicket throws', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ question_id: 'q1', option_key: 'nicht_erfüllt', saved_at: new Date(), details_text: 'broken' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'ev1', attempt: 2 }] });
      openFailureTicket.mockRejectedValueOnce(new Error('bridge down'));
      enqueueOutboxRetry.mockResolvedValueOnce(undefined);

      await updateTestStatuses('a1');

      expect(enqueueOutboxRetry).toHaveBeenCalledTimes(1);
      const call = enqueueOutboxRetry.mock.calls[0][1] as Record<string, unknown>;
      expect(call.assignmentId).toBe('a1');
      expect(call.attempt).toBe(2);
    });
  });

  describe('listTestStatusesForMonitoring', () => {
    it('groups rows by template and excludes non test_step questions via the SQL filter', async () => {
      query.mockResolvedValueOnce({
        rows: [
          { template_id: 't1', template_title: 'Tpl', question_id: 'q1', position: 1, question_text: '?', test_expected_result: null, test_function_url: null, test_role: null, last_result: 'erfüllt', last_result_at: new Date(), last_success_at: new Date() },
          { template_id: 't1', template_title: 'Tpl', question_id: 'q2', position: 2, question_text: '?2', test_expected_result: null, test_function_url: null, test_role: null, last_result: null, last_result_at: null, last_success_at: null },
        ],
      });
      const out = await listTestStatusesForMonitoring();
      expect(out).toHaveLength(1);
      expect(out[0].questions).toHaveLength(2);
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/is_system_test = true/);
      expect(sql).toMatch(/question_type = 'test_step'/);
    });
  });

  describe('listArchivedScores', () => {
    it('returns rows for the given assignment id', async () => {
      query.mockResolvedValueOnce({ rows: [{ assignment_id: 'a1', dimension_id: 'd1', dimension_name: 'D', final_score: 8, threshold_mid: 5, threshold_high: 9, level: 'high', snapshot_at: new Date() }] });
      const out = await listArchivedScores('a1');
      expect(out).toHaveLength(1);
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/FROM questionnaire_assignment_scores/);
      expect(sql).toMatch(/WHERE s.assignment_id = \$1/);
    });
  });

  describe('listEvidenceByAssignment', () => {
    it('returns aggregated evidence rows', async () => {
      query.mockResolvedValueOnce({ rows: [{ question_id: 'q1', latest_evidence_id: 'e1', latest_attempt: 3, evidence_count: 3 }] });
      const out = await listEvidenceByAssignment('a1');
      expect(out[0].question_id).toBe('q1');
    });
  });

  describe('listTestStepAttempts', () => {
    it('maps question_id to retest_attempt (default 0 when null)', async () => {
      query.mockResolvedValueOnce({
        rows: [
          { question_id: 'q1', retest_attempt: 2 },
          { question_id: 'q2', retest_attempt: null },
        ],
      });
      const out = await listTestStepAttempts('a1');
      expect(out).toEqual({ q1: 2, q2: 0 });
    });
  });

  describe('listQuestionsWithSuccessfulRecording', () => {
    it('returns distinct question_ids with erfüllt answers', async () => {
      query.mockResolvedValueOnce({ rows: [{ question_id: 'q1' }, { question_id: 'q2' }] });
      const out = await listQuestionsWithSuccessfulRecording();
      expect(out).toEqual(['q1', 'q2']);
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/a\.option_key = 'erfüllt'/);
    });
  });
});
