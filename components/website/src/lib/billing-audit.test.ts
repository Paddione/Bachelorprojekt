import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { logBillingEvent, getBillingAuditLog } from './billing-audit';

beforeEach(() => query.mockReset());

describe('billing-audit', () => {
  it('logBillingEvent issues an INSERT with all fields mapped to snake_case columns', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await logBillingEvent({
      invoiceId: 'inv-1',
      action: 'paid',
      actor: { userId: 'u-1', email: 'admin@example.com' },
      fromStatus: 'open',
      toStatus: 'paid',
      reason: 'cash',
      metadata: { source: 'manual' },
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO billing_audit_log/);
    expect(params[0]).toBe('inv-1');
    expect(params[1]).toBe('paid');
    expect(params[2]).toBe('u-1');
    expect(params[3]).toBe('admin@example.com');
    expect(params[4]).toBe('open');
    expect(params[5]).toBe('paid');
    expect(params[6]).toBe('cash');
    expect(params[7]).toBe(JSON.stringify({ source: 'manual' }));
  });

  it('logBillingEvent defaults actor / status / reason / metadata to null', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await logBillingEvent({ invoiceId: 'inv-2', action: 'created' });
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[2]).toBeNull();
    expect(params[3]).toBeNull();
    expect(params[4]).toBeNull();
    expect(params[5]).toBeNull();
    expect(params[6]).toBeNull();
    expect(params[7]).toBeNull();
  });

  it('getBillingAuditLog maps snake_case columns into camelCase entries', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 7,
        invoice_id: 'inv-3',
        action: 'paid',
        actor_user_id: 'u-1',
        actor_email: 'admin@example.com',
        from_status: 'open',
        to_status: 'paid',
        reason: 'cash',
        metadata: { source: 'manual' },
        created_at: new Date('2026-05-20T10:00:00Z'),
      }],
    });
    const out = await getBillingAuditLog('inv-3');
    expect(out).toEqual([{
      id: 7,
      invoiceId: 'inv-3',
      action: 'paid',
      actorUserId: 'u-1',
      actorEmail: 'admin@example.com',
      fromStatus: 'open',
      toStatus: 'paid',
      reason: 'cash',
      metadata: { source: 'manual' },
      createdAt: '2026-05-20T10:00:00.000Z',
    }]);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT \* FROM billing_audit_log/);
    expect(sql).toMatch(/WHERE invoice_id=\$1/);
    expect(params).toEqual(['inv-3']);
  });

  it('getBillingAuditLog returns empty array when there are no rows', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await getBillingAuditLog('inv-x')).toEqual([]);
  });
});
