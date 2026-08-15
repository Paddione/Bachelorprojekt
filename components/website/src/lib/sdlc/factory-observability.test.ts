import { describe, it, expect, vi, afterEach } from 'vitest';
import { queryRange, buildPromQL } from './factory-observability';

afterEach(() => vi.restoreAllMocks());

describe('buildPromQL', () => {
  it('builds a cost-per-day query without brand literals', () => {
    const q = buildPromQL('cost', 'mentolder');
    expect(q).toContain('claude_code_cost_usage');
    expect(q).not.toMatch(/mentolder\.de|korczewski\.de/);
  });
});

describe('queryRange', () => {
  it('proxies Prometheus /api/v1/query_range and returns matrix data', async () => {
    const fakeResp = { status: 'success', data: { resultType: 'matrix', result: [{ metric: {}, values: [[1, '5']] }] } };
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => fakeResp })) as unknown as typeof fetch;
    const r = await queryRange('up', Date.now() / 1000 - 3600, Date.now() / 1000, 60);
    expect(r.data.result.length).toBe(1);
    expect(vi.mocked(global.fetch).mock.calls[0][0]).toContain('/api/v1/query_range');
  });

  it('throws a typed error when Prometheus is unreachable', async () => {
    global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    await expect(queryRange('up', 0, 1, 60)).rejects.toThrow();
  });
});
