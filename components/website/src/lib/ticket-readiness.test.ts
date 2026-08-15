import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const pool = { query: (...a: unknown[]) => query(...a) };
import { allPredecessorsDone, updateSuccessorReadiness } from './ticket-readiness';

beforeEach(() => query.mockReset());

describe('ticket-readiness', () => {
  it('allPredecessorsDone: returns true immediately for an empty list (no DB call)', async () => {
    expect(await allPredecessorsDone([], pool as never)).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('allPredecessorsDone: returns false when not every predecessor has status=done', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { external_id: 'T-1', status: 'done' },
        { external_id: 'T-2', status: 'in_progress' },
      ],
    });
    expect(await allPredecessorsDone(['T-1', 'T-2'], pool as never)).toBe(false);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params).toEqual([['T-1', 'T-2']]);
  });

  it('allPredecessorsDone: returns false when the query returns fewer rows than expected', async () => {
    query.mockResolvedValueOnce({ rows: [{ external_id: 'T-1', status: 'done' }] });
    expect(await allPredecessorsDone(['T-1', 'T-2'], pool as never)).toBe(false);
  });

  it('allPredecessorsDone: returns true when every row exists and is done', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { external_id: 'T-1', status: 'done' },
        { external_id: 'T-2', status: 'done' },
      ],
    });
    expect(await allPredecessorsDone(['T-1', 'T-2'], pool as never)).toBe(true);
  });

  it('updateSuccessorReadiness: stamps abhaengigkeiten_klar for every successor whose deps are done', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          { id: 's-1', external_id: 'T-9', depends_on: ['T-1', 'T-2'] },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ external_id: 'T-1', status: 'done' }, { external_id: 'T-2', status: 'done' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const updated = await updateSuccessorReadiness('T-0', pool as never);
    expect(updated).toBe(1);

    const updateSql = query.mock.calls[2][0] as string;
    expect(updateSql).toMatch(/UPDATE tickets\.tickets/);
    expect(updateSql).toMatch(/abhaengigkeiten_klar/);
    const updateParams = query.mock.calls[2][1] as unknown[];
    expect(updateParams).toEqual(['s-1']);
  });

  it('updateSuccessorReadiness: returns 0 when no successors depend on the ticket', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await updateSuccessorReadiness('T-0', pool as never)).toBe(0);
  });
});
