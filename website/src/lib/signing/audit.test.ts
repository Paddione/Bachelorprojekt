import { describe, it, expect, vi, beforeEach } from 'vitest';

const getPool = vi.fn();
const query = vi.fn();
vi.mock('../documents-db', () => ({ getPool: (...a: unknown[]) => getPool(...a) }));

import { logSigningEvent } from './audit';
import type { AuditEvent } from './types';

beforeEach(() => {
  vi.resetAllMocks();
  getPool.mockResolvedValue({ query: (...a: unknown[]) => query(...a) });
});

describe('signing/audit', () => {
  it('logSigningEvent issues a typed INSERT with the assignment + actor fields', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await logSigningEvent(
      'asgn-1',
      'opened' as AuditEvent,
      '10.0.0.1',
      'Mozilla/5.0',
      'user-7',
    );
    expect(getPool).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO signing_audit_log/);
    expect(sql).toMatch(/\$3::inet/);
    expect(params).toEqual(['asgn-1', 'opened', '10.0.0.1', 'Mozilla/5.0', 'user-7']);
  });

  it('logSigningEvent tolerates null ip / userAgent / actorId', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await logSigningEvent('asgn-2', 'signed' as AuditEvent, null, null, null);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params.slice(0, 5)).toEqual(['asgn-2', 'signed', null, null, null]);
  });
});
