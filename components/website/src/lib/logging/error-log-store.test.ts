import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { persistError, __setPoolForTesting } from './error-log-store';

const query = vi.fn();
const mockPool = { query: (...a: unknown[]) => query(...a) } as unknown as Pool;

beforeEach(() => {
  query.mockReset();
  __setPoolForTesting(mockPool);
});
afterEach(() => {
  __setPoolForTesting(null);
});

describe('error-log-store', () => {
  it('should call query with parameterised INSERT on success', async () => {
    query.mockResolvedValue({ rows: [] });

    await persistError({ source: 'server', message: 'test error' });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO error_log'),
      ['server', 'test error', null, null, '{}'],
    );
  });

  it('should log to console.error on insert failure without throwing', async () => {
    query.mockRejectedValue(new Error('Connection refused'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(persistError({ source: 'browser', message: 'another error' })).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      '[error-log] persistError insert failed:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
