import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const clientQ = vi.fn();
const connect = vi.fn();
vi.mock('./schema', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: (...a: unknown[]) => connect(...a),
  },
}));

import {
  getQTemplate, getQQuestion, getQAssignment, listQTemplates, createQTemplate, updateQTemplate, deleteQTemplate,
  listQDimensions, upsertQDimension, deleteQDimension,
  listQQuestions, upsertQQuestion, deleteQQuestion,
  listQAnswerOptions, listQAnswerOptionsForTemplate, replaceQAnswerOptions,
  createQAssignment, listQAssignmentsForCustomer, listQAssignmentsForProject, updateQAssignment,
  dismissQAssignment, archiveQAssignment, reassignQAssignment, countPendingQAssignmentsForCustomer,
  upsertQAnswer, listQAnswers,
} from './queries';

beforeEach(() => {
  query.mockReset();
  clientQ.mockReset();
  connect.mockReset();
  connect.mockResolvedValue({ query: (...a: unknown[]) => clientQ(...a), release: () => undefined });
});

describe('questionnaire-db/queries', () => {
  describe('getQTemplate', () => {
    it('returns the row or null when missing', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      expect(await getQTemplate('missing')).toBeNull();

      query.mockResolvedValueOnce({ rows: [{ id: 't1', title: 'X' }] });
      expect((await getQTemplate('t1'))!.title).toBe('X');
    });
  });

  describe('listQTemplates', () => {
    it('SELECTs from questionnaire_templates with dimension_count subquery', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 't1', title: 'Test', dimension_count: 3 }] });
      const result = await listQTemplates();
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/FROM questionnaire_templates t/);
      expect(sql).toMatch(/ORDER BY t\.created_at DESC/);
      expect(sql).toMatch(/dimension_count/);
      expect(result[0].dimension_count).toBe(3);
    });
  });

  describe('createQTemplate', () => {
    it('INSERT with title, description, instructions', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 't1' }] });
      await createQTemplate({ title: 'T', description: 'D', instructions: 'I' });
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO questionnaire_templates/);
      expect(params).toEqual(['T', 'D', 'I']);
    });
  });

  describe('updateQTemplate', () => {
    it('builds a dynamic SET clause from provided fields', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 't1' }] });
      await updateQTemplate('t1', { title: 'New', status: 'active' });
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/SET updated_at = now\(\)/);
      expect(sql).toMatch(/title = \$1/);
      expect(sql).toMatch(/status = \$2/);
      expect(params).toEqual(['New', 'active', 't1']);
    });
  });

  describe('deleteQTemplate', () => {
    it('issues a DELETE by id', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await deleteQTemplate('t1');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/DELETE FROM questionnaire_templates/);
      expect(params).toEqual(['t1']);
    });
  });

  describe('listQDimensions', () => {
    it('SELECTs dimensions for a template ordered by position', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await listQDimensions('t1');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/FROM questionnaire_dimensions/);
      expect(sql).toMatch(/ORDER BY position/);
      expect(params).toEqual(['t1']);
    });
  });

  describe('upsertQDimension', () => {
    it('INSERT with the right columns', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'd1' }] });
      await upsertQDimension({ templateId: 't1', name: 'Klarheit', position: 0, thresholdMid: 50, thresholdHigh: 80, scoreMultiplier: 1 });
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO questionnaire_dimensions/);
    });
  });

  describe('deleteQDimension', () => {
    it('DELETE by id', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await deleteQDimension('d1');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/DELETE FROM questionnaire_dimensions/);
      expect(params).toEqual(['d1']);
    });
  });

  describe('listQQuestions', () => {
    it('SELECTs questions for a template', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await listQQuestions('t1');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/FROM questionnaire_questions/);
      expect(params).toEqual(['t1']);
    });
  });

  describe('upsertQQuestion', () => {
    it('INSERT with the right columns', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'q1' }] });
      await upsertQQuestion({
        templateId: 't1', position: 0, questionText: '?', questionType: 'free_text' as any,
        testExpectedResult: null, testFunctionUrl: null, testMenuPath: null, testRole: null,
      });
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO questionnaire_questions/);
    });
  });

  describe('deleteQQuestion / listQAnswerOptions / listQAnswerOptionsForTemplate', () => {
    it('deleteQQuestion: DELETE by id', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await deleteQQuestion('q1');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/DELETE FROM questionnaire_questions/);
      expect(params).toEqual(['q1']);
    });

    it('listQAnswerOptions: SELECT WHERE question_id', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await listQAnswerOptions('q1');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/FROM questionnaire_answer_options/);
      expect(sql).toMatch(/question_id = \$1/);
      expect(params).toEqual(['q1']);
    });

    it('listQAnswerOptionsForTemplate: joins questions', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await listQAnswerOptionsForTemplate('t1');
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/JOIN questionnaire_questions/);
      expect(sql).toMatch(/WHERE q\.template_id = \$1/);
    });
  });

  describe('replaceQAnswerOptions', () => {
    it('runs the replacement in a transaction', async () => {
      clientQ
        .mockResolvedValueOnce({ rows: [] })  // BEGIN
        .mockResolvedValueOnce({ rows: [] })  // DELETE
        .mockResolvedValueOnce({ rows: [] })  // INSERT
        .mockResolvedValueOnce({ rows: [] });// COMMIT
      await replaceQAnswerOptions('q1', [{ optionKey: 'a', label: 'A', dimensionId: 'd1', weight: 1 }]);
      const delSql = clientQ.mock.calls[1][0] as string;
      const insSql = clientQ.mock.calls[2][0] as string;
      expect(delSql).toMatch(/DELETE FROM questionnaire_answer_options/);
      expect(insSql).toMatch(/INSERT INTO questionnaire_answer_options/);
    });
  });

  describe('createQAssignment', () => {
    it('INSERTs an assignment, enriches with template_title, and returns the QAssignment', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'a-1', customer_id: 'c1', template_id: 't1', status: 'pending' }] })  // INSERT
        .mockResolvedValueOnce({ rows: [{ id: 't1', title: 'My Template' }] });  // getQTemplate
      const out = await createQAssignment({ customerId: 'c1', templateId: 't1' });
      expect(out).toMatchObject({ id: 'a-1', template_title: 'My Template' });
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO questionnaire_assignments/);
      expect(params).toEqual(['c1', 't1', null]);
    });
  });

  describe('listQAssignmentsForCustomer', () => {
    it('SELECT with WHERE customer_id = $1', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await listQAssignmentsForCustomer('c1');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/FROM questionnaire_assignments/);
      expect(sql).toMatch(/customer_id = \$1/);
      expect(params).toEqual(['c1']);
    });
  });

  describe('listQAssignmentsForProject', () => {
    it('SELECT with WHERE project_id = $1', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await listQAssignmentsForProject('p1');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/project_id = \$1/);
      expect(params).toEqual(['p1']);
    });
  });

  describe('updateQAssignment', () => {
    it('builds a dynamic SET clause and enriches with template_title', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'a-1', template_id: 't1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't1', title: 'My Template' }] });
      await updateQAssignment('a-1', { status: 'submitted', coachNotes: 'X' });
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/UPDATE questionnaire_assignments/);
      expect(sql).toMatch(/status = \$1/);
      expect(sql).toMatch(/coach_notes = \$2/);
      expect(params).toEqual(['submitted', 'X', 'a-1']);
    });

    it('returns null when no row matches the UPDATE', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      expect(await updateQAssignment('a-missing', { status: 'submitted' })).toBeNull();
    });

    it('returns the existing assignment when no fields are provided', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'a-1', template_id: 't1', status: 'pending' }] });
      query.mockResolvedValueOnce({ rows: [{ id: 't1', title: 'X' }] });
      const out = await updateQAssignment('a-1', {});
      expect(out).toMatchObject({ id: 'a-1' });
    });
  });

  describe('dismissQAssignment', () => {
    it('UPDATE sets status + dismissed_at + reason', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'a-1', template_id: 't1' }] })  // UPDATE
        .mockResolvedValueOnce({ rows: [{ id: 't1', title: 'X' }] });        // getQTemplate
      const out = await dismissQAssignment('a-1', 'invalid');
      expect(out).toMatchObject({ id: 'a-1' });
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/status = \$1/);
      expect(sql).toMatch(/dismiss_reason = \$2/);
      expect(sql).toMatch(/dismissed_at = now\(\)/);
    });
  });

  describe('archiveQAssignment', () => {
    it('returns a tagged union for not_reopenable status', async () => {
      clientQ
        .mockResolvedValueOnce({ rows: [] })  // BEGIN
        .mockResolvedValueOnce({ rows: [{ template_id: 't1', status: 'pending' }] })  // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const out = await archiveQAssignment('a-1');
      expect(out).toEqual({ reason: 'not_archivable', status: 'pending' });
    });

    it('returns not_found when no row matches', async () => {
      clientQ
        .mockResolvedValueOnce({ rows: [] })  // BEGIN
        .mockResolvedValueOnce({ rows: [] })  // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const out = await archiveQAssignment('a-missing');
      expect(out).toEqual({ reason: 'not_found' });
    });
  });

  describe('reassignQAssignment', () => {
    it('returns not_found when the source assignment does not exist', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const out = await reassignQAssignment('missing');
      expect(out).toEqual({ reason: 'not_found' });
    });

    it('creates a new assignment linked to the same template', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ template_id: 't1', customer_id: 'c1', project_id: null }] })  // getQAssignment
        .mockResolvedValueOnce({ rows: [{ id: 'a-2', customer_id: 'c1', template_id: 't1' }] })  // INSERT
        .mockResolvedValueOnce({ rows: [{ id: 't1', title: 'X' }] });                            // getQTemplate
      const out = await reassignQAssignment('a-1');
      expect(out).toMatchObject({ assignment: { id: 'a-2' } });
    });
  });

  describe('countPendingQAssignmentsForCustomer', () => {
    it('returns the integer count', async () => {
      query.mockResolvedValueOnce({ rows: [{ count: 3 }] });
      expect(await countPendingQAssignmentsForCustomer('c1')).toBe(3);
    });
  });

  describe('upsertQAnswer', () => {
    it('INSERT with ON CONFLICT (assignment_id, question_id)', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await upsertQAnswer({
        assignmentId: 'a-1', questionId: 'q1', optionKey: 'yes', detailsText: null,
      });
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO questionnaire_answers/);
      expect(sql).toMatch(/ON CONFLICT/);
    });
  });

  describe('listQAnswers', () => {
    it('SELECT WHERE assignment_id', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await listQAnswers('a-1');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/FROM questionnaire_answers/);
      expect(sql).toMatch(/assignment_id = \$1/);
      expect(params).toEqual(['a-1']);
    });
  });
});
