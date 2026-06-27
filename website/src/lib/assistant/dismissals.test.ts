import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const ensure = vi.fn();
vi.mock('../website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('./schema', () => ({ ensureAssistantSchema: (...a: unknown[]) => ensure(...a) }));

import { snoozeNudge, isSnoozed, listFirstSeenAt, recordFirstSeen } from './dismissals';

beforeEach(() => { query.mockReset(); ensure.mockReset(); });

describe('assistant/dismissals', () => {
  it('snoozeNudge upserts the (user_sub, nudge_id) row and extends snoozed_until', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    ensure.mockResolvedValueOnce(undefined);
    await snoozeNudge('user-1', 'nudge-1', 120);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO assistant_nudge_dismissals/);
    expect(sql).toMatch(/ON CONFLICT \(user_sub, nudge_id\)/);
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe('nudge-1');
    expect(String(params[2])).toBe('120');
  });

  it('isSnoozed: true when snoozed_until is in the future', async () => {
    ensure.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [{ alive: true }] });
    expect(await isSnoozed('user-1', 'nudge-1')).toBe(true);
  });

  it('isSnoozed: false when the row is missing', async () => {
    ensure.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [] });
    expect(await isSnoozed('user-1', 'nudge-1')).toBe(false);
  });

  it('isSnoozed: coerces falsy to false (truthy check)', async () => {
    ensure.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [{ alive: null }] });
    expect(await isSnoozed('user-1', 'nudge-1')).toBe(false);
  });

  it('listFirstSeenAt: returns the Date when found, null otherwise', async () => {
    ensure.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [{ first_seen_at: new Date('2026-04-01T00:00:00Z') }] });
    const d = await listFirstSeenAt('user-1', 'admin');
    expect(d).toBeInstanceOf(Date);
    expect((d as Date).toISOString()).toBe('2026-04-01T00:00:00.000Z');

    ensure.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [] });
    expect(await listFirstSeenAt('user-1', 'admin')).toBeNull();
  });

  it('recordFirstSeen: ON CONFLICT keeps the original timestamp', async () => {
    ensure.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [{ first_seen_at: new Date('2026-04-01T00:00:00Z') }] });
    const d = await recordFirstSeen('user-1', 'admin');
    expect(d.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(user_sub, profile\) DO UPDATE/);
    expect(sql).toMatch(/SET first_seen_at = assistant_first_seen\.first_seen_at/);
  });
});
