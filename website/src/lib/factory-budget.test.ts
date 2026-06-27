import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { setBudgetLimit, getDailyBudgetSummary, getRunBudgetByTicket, getRecentRuns } from './factory-budget';

beforeEach(() => query.mockReset());

describe('factory-budget', () => {
  it('setBudgetLimit writes a fixed-precision usd string into factory_control', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await setBudgetLimit(12.5);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO tickets\.factory_control/);
    expect(sql).toMatch(/ON CONFLICT \(key, brand\)/);
    expect(params[0]).toBe('budget-limit-daily-usd');
    expect(params[1]).toBe('12.50');
  });

  it('getDailyBudgetSummary: aggregates limit + per-provider rows for a given date', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ value: '15.00' }] })                    // limit
      .mockResolvedValueOnce({ rows: [{ used: '4.20' }] })                      // used sum
      .mockResolvedValueOnce({ rows: [{                                       // byProvider
        provider: 'anthropic',
        tokens_in_act: '100', tokens_out_act: '20',
        cost_usd_act: '4.20',
        tokens_in_est: '110', tokens_out_est: '22',
        cost_usd_est: '4.50',
      }] });
    const out = await getDailyBudgetSummary('2026-05-01');
    expect(out.used).toBeCloseTo(4.2);
    expect(out.limit).toBe(15);
    expect(out.byProvider[0]).toEqual({
      provider: 'anthropic',
      tokensInAct: '100', tokensOutAct: '20', costUsdAct: '4.20',
      tokensInEst: '110', tokensOutEst: '22', costUsdEst: '4.50',
    });
    expect(query.mock.calls[0][1]).toBeUndefined(); // limit (no params)
    expect(query.mock.calls[1][1]).toEqual(['2026-05-01']); // used
    expect(query.mock.calls[2][1]).toEqual(['2026-05-01']); // byProvider
  });

  it('getDailyBudgetSummary: returns null limit when the row is missing or non-numeric', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ used: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    expect((await getDailyBudgetSummary('2026-05-01')).limit).toBeNull();

    query.mockReset();
    query
      .mockResolvedValueOnce({ rows: [{ value: 'NaN-string' }] })
      .mockResolvedValueOnce({ rows: [{ used: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    expect((await getDailyBudgetSummary('2026-05-01')).limit).toBeNull();
  });

  it('getRunBudgetByTicket: maps columns and clips the run date to YYYY-MM-DD', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'b-1',
        ticket_id: 't-1',
        run_date: new Date('2026-05-20T10:30:00Z'),
        provider: 'anthropic',
        model_id: 'sonnet',
        phase: 'scout',
        tokens_in_est: 50, tokens_out_est: 25, cost_usd_est: '0.42',
        tokens_in_act: 48, tokens_out_act: 24, cost_usd_act: '0.40',
        created_at: new Date('2026-05-20T10:00:00Z'),
        updated_at: new Date('2026-05-20T10:30:00Z'),
      }],
    });
    const out = await getRunBudgetByTicket('T000001');
    expect(out).toEqual([{
      id: 'b-1',
      ticketId: 't-1',
      runDate: '2026-05-20',
      provider: 'anthropic',
      modelId: 'sonnet',
      phase: 'scout',
      tokensInEst: 50, tokensOutEst: 25, costUsdEst: 0.42,
      tokensInAct: 48, tokensOutAct: 24, costUsdAct: 0.40,
      createdAt: '2026-05-20T10:00:00.000Z',
      updatedAt: '2026-05-20T10:30:00.000Z',
    }]);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM tickets\.factory_run_budget b/);
    expect(sql).toMatch(/WHERE t\.id::text = \$1 OR t\.external_id = \$1/);
    expect(params).toEqual(['T000001']);
  });

  it('getRecentRuns: defaults to limit 5 and maps row to summary', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        ticket_id: 't-1',
        external_id: 'T000001',
        title: 'Test',
        run_date: new Date('2026-05-20T10:30:00Z'),
        total_cost_act: 1.5,
        total_cost_est: 2.0,
      }],
    });
    const out = await getRecentRuns();
    expect(out).toEqual([{
      ticketId: 't-1', externalId: 'T000001', title: 'Test',
      runDate: '2026-05-20', totalCostAct: 1.5, totalCostEst: 2.0,
    }]);
    expect(query.mock.calls[0][1]).toEqual([5]);
  });
});
