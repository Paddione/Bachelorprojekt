import { describe, it, expect } from 'vitest';
import { pool } from '../db-pool';

// T001490 Task 5: db-pool carries connectionTimeoutMillis +
// statement_timeout so a slow / hung DB does not pin the request.
// The Pool options object is internal (the pg.Pool type does not
// expose `lookup` / `statement_timeout` as public fields) — we reach
// in via the underlying `options` to assert the contract.
describe('db-pool (T001490 fail-soft timeouts)', () => {
  it('configures connectionTimeoutMillis = 2000', () => {
    const opts = (pool as unknown as { options: Record<string, unknown> }).options;
    expect(opts.connectionTimeoutMillis).toBe(2_000);
  });

  it('configures statement_timeout = 2000 (per-checkout libpq cap)', () => {
    const opts = (pool as unknown as { options: Record<string, unknown> }).options;
    expect(opts.statement_timeout).toBe(2_000);
  });

  it('configures idleTimeoutMillis = 30000 (so idle connections drain)', () => {
    const opts = (pool as unknown as { options: Record<string, unknown> }).options;
    expect(opts.idleTimeoutMillis).toBe(30_000);
  });
});
