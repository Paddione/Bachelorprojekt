import { describe, it, expect, vi } from 'vitest';
import { getTicketGraph } from './ticket-graph';

vi.mock('./website-db', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from './website-db';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

describe('getTicketGraph', () => {
  it('returns an empty graph when no rows are returned', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const out = await getTicketGraph();
    expect(out).toEqual({ nodes: [], edges: [], criticalPath: [] });
  });

  it('produces nodes and edges from the two SQL queries', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { external_id: 'T0001', title: 'A', status: 'in_progress', priority: 'hoch', depth: 0 },
          { external_id: 'T0002', title: 'B', status: 'in_progress', priority: 'mittel', depth: 1 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { external_id: 'T0002', depends_on: ['T0001'] },
        ],
      });
    const out = await getTicketGraph();
    expect(out.nodes).toHaveLength(2);
    expect(out.edges).toEqual([{ from: 'T0002', to: 'T0001', type: 'depends_on' }]);
  });

  it('skips edges from tickets not in the returned node set', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { external_id: 'T0001', title: 'A', status: 'in_progress', priority: 'hoch', depth: 0 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { external_id: 'T9999', depends_on: ['T0001'] }, // T9999 not in node set
        ],
      });
    const out = await getTicketGraph();
    expect(out.edges).toEqual([]);
  });

  it('computes a non-empty critical path for a chain of dependencies', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { external_id: 'T0001', title: 'A', status: 'in_progress', priority: 'hoch', depth: 0 },
          { external_id: 'T0002', title: 'B', status: 'in_progress', priority: 'mittel', depth: 1 },
          { external_id: 'T0003', title: 'C', status: 'in_progress', priority: 'niedrig', depth: 2 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { external_id: 'T0002', depends_on: ['T0001'] },
          { external_id: 'T0003', depends_on: ['T0002'] },
        ],
      });
    const out = await getTicketGraph();
    expect(out.criticalPath).toEqual(['T0001', 'T0002', 'T0003']);
  });

  it('returns empty critical path for a single-node graph', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { external_id: 'T0001', title: 'A', status: 'in_progress', priority: 'hoch', depth: 0 },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const out = await getTicketGraph();
    expect(out.criticalPath).toEqual([]);
  });
});
