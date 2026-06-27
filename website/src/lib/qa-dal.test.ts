import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const connect = vi.fn();
const client = {
  query: (...a: unknown[]) => clientQ(...a),
  release: vi.fn(),
};
const clientQ = vi.fn();
vi.mock('./website-db', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: (...a: unknown[]) => connect(...a),
  },
}));

import { getQaQueue, createQaReview, QA_CRITERIA } from './qa-dal';

beforeEach(() => {
  query.mockReset();
  connect.mockReset();
  clientQ.mockReset();
  connect.mockResolvedValue(client);
});

describe('qa-dal', () => {
  it('QA_CRITERIA is a frozen tuple of well-known keys', () => {
    expect(QA_CRITERIA).toHaveLength(5);
    const keys = QA_CRITERIA.map(c => c.key);
    expect(keys).toContain('spec_match');
    expect(keys).toContain('no_regression');
    expect(keys).toContain('responsive');
    expect(keys).toContain('performance');
    expect(keys).toContain('copy');
  });

  it('getQaQueue: returns ticket rows joined with the latest deploy + last review', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        ticket_id: 't-1',
        ext_id: 'T000001',
        title: 'Titel',
        pr_number: 42,
        deployed_at: new Date('2026-05-20T10:00:00Z'),
        last_criteria: [{ key: 'spec_match', label: '...', passed: true }],
        last_notes: 'sieht gut aus',
      }],
    });
    const out = await getQaQueue();
    expect(out).toEqual([{
      ticketId: 't-1',
      extId: 'T000001',
      title: 'Titel',
      prNumber: 42,
      deployedAt: '2026-05-20T10:00:00.000Z',
      lastReview: { criteria: [{ key: 'spec_match', label: '...', passed: true }], notes: 'sieht gut aus' },
    }]);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/FROM tickets\.tickets t/);
    expect(sql).toMatch(/LEFT JOIN LATERAL/);
    expect(sql).toMatch(/t\.status = 'qa_review'/);
  });

  it('getQaQueue: returns lastReview: null when last_criteria is missing', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        ticket_id: 't-1', ext_id: 'T000001', title: 'X',
        pr_number: null, deployed_at: null,
        last_criteria: null, last_notes: null,
      }],
    });
    const out = await getQaQueue();
    expect(out[0].lastReview).toBeNull();
    expect(out[0].prNumber).toBeNull();
    expect(out[0].deployedAt).toBeNull();
  });

  it('createQaReview (approved): BEGIN + INSERT review + UPDATE done + COMMIT', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // INSERT review
      .mockResolvedValueOnce({ rows: [] })  // UPDATE tickets
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await createQaReview({
      ticketId: 't-1',
      criteria: [{ key: 'spec_match', passed: true }, { key: 'copy', passed: false }],
      notes: 'fast',
      verdict: 'approved',
    });

    const [beginSql] = clientQ.mock.calls[0];
    const [insertSql, insertParams] = clientQ.mock.calls[1];
    const [updateSql, updateParams] = clientQ.mock.calls[2];
    const [commitSql] = clientQ.mock.calls[3];

    expect(beginSql).toBe('BEGIN');
    expect(insertSql).toMatch(/INSERT INTO tickets\.qa_reviews/);
    expect(JSON.parse(insertParams[1] as string)).toEqual([
      { key: 'spec_match', label: 'Feature verhält sich wie spezifiziert', passed: true },
      { key: 'no_regression', label: 'Keine sichtbaren Regressions', passed: false },
      { key: 'responsive', label: 'Mobile / Responsive OK', passed: false },
      { key: 'performance', label: 'Ladezeit akzeptabel', passed: false },
      { key: 'copy', label: 'Texte / Übersetzungen korrekt', passed: false },
    ]);
    expect(updateSql).toMatch(/SET status = 'done'/);
    expect(updateParams).toEqual(['t-1']);
    expect(commitSql).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('createQaReview (rejected): routes to in_progress + injects feedback', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // INSERT review
      .mockResolvedValueOnce({ rows: [] })  // UPDATE in_progress
      .mockResolvedValueOnce({ rows: [] })  // INSERT injection
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await createQaReview({
      ticketId: 't-2',
      criteria: [{ key: 'spec_match', passed: false }],
      notes: 'Konkret fehlt X',
      verdict: 'rejected',
      re_entry_phase: 'implement',
    });

    const [injectSql, injectParams] = clientQ.mock.calls[3];
    expect(injectSql).toMatch(/INSERT INTO tickets\.ticket_injections/);
    expect(injectParams[0]).toBe('t-2');
    expect(injectParams[1]).toBe('implement');
    expect(injectParams[2] as string).toMatch(/QS-Abnahme fehlgeschlagen/);
    expect(injectParams[2] as string).toMatch(/Feature verhält sich wie spezifiziert/);
    expect(injectParams[2] as string).toMatch(/Kommentar: Konkret fehlt X/);
  });

  it('createQaReview: ROLLBACK on error', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockRejectedValueOnce(new Error('insert broken'))  // INSERT review fails
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await expect(createQaReview({
      ticketId: 't-x', criteria: [], verdict: 'approved',
    })).rejects.toThrow('insert broken');
    expect(clientQ.mock.calls[2][0]).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
