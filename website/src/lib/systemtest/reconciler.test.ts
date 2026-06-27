import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const pool = { query: (...a: unknown[]) => query(...a) };
import { runReconciler } from './reconciler';

beforeEach(() => query.mockReset());

describe('systemtest/reconciler', () => {
  it('patches fixed-but-unstamped rows and reports the count', async () => {
    query.mockResolvedValueOnce({ rowCount: 4, rows: [] });
    const out = await runReconciler(pool as never);
    expect(out).toEqual({ patched: 4 });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/UPDATE questionnaire_test_status/);
    expect(sql).toMatch(/SET retest_pending_at/);
    expect(sql).toMatch(/t\.resolution = 'fixed'/);
    expect(sql).toMatch(/qts\.retest_pending_at IS NULL/);
    expect(sql).toMatch(/source_test_assignment_id = qts\.last_assignment_id/);
    expect(sql).toMatch(/source_test_question_id\s*=\s*qts\.question_id/);
  });

  it('returns patched: 0 when no rows match', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await runReconciler(pool as never)).toEqual({ patched: 0 });
  });

  it('tolerates a null rowCount (defaults to 0)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await runReconciler(pool as never)).toEqual({ patched: 0 });
  });
});
