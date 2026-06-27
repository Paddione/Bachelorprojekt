import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./schema', () => ({ ensureAssistantSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { snoozeNudge, isSnoozed, listFirstSeenAt, recordFirstSeen } from './dismissals';

beforeEach(() => {
  query.mockReset();
});

describe('assistant/dismissals', () => {
  describe('snoozeNudge', () => {
    it('upserts a snoozed_until row with the given seconds offset', async () => {
      query.mockResolvedValueOnce({ rowCount: 1 });
      await snoozeNudge('user-1', 'nudge-a', 60);
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO assistant_nudge_dismissals/);
      expect(sql).toMatch(/ON CONFLICT \(user_sub, nudge_id\)/);
      const params = query.mock.calls[0][1] as unknown[];
      expect(params).toEqual(['user-1', 'nudge-a', '60']);
    });
  });

  describe('isSnoozed', () => {
    it('returns true when the snooze is still alive', async () => {
      query.mockResolvedValueOnce({ rows: [{ alive: true }] });
      expect(await isSnoozed('user-1', 'nudge-a')).toBe(true);
    });

    it('returns false when the snooze is past or the row is missing', async () => {
      query.mockResolvedValueOnce({ rows: [{ alive: false }] });
      expect(await isSnoozed('user-1', 'nudge-a')).toBe(false);

      query.mockResolvedValueOnce({ rows: [] });
      expect(await isSnoozed('user-1', 'nudge-b')).toBe(false);
    });
  });

  describe('listFirstSeenAt', () => {
    it('returns the first_seen_at Date or null when missing', async () => {
      query.mockResolvedValueOnce({ rows: [{ first_seen_at: new Date('2026-01-01') }] });
      expect((await listFirstSeenAt('user-1', 'admin'))?.toISOString()).toBe('2026-01-01T00:00:00.000Z');

      query.mockResolvedValueOnce({ rows: [] });
      expect(await listFirstSeenAt('user-1', 'admin')).toBeNull();
    });
  });

  describe('recordFirstSeen', () => {
    it('returns the persisted first_seen_at timestamp (upsert)', async () => {
      query.mockResolvedValueOnce({ rows: [{ first_seen_at: new Date('2026-02-02T12:00:00Z') }] });
      const out = await recordFirstSeen('user-1', 'admin');
      expect(out.toISOString()).toBe('2026-02-02T12:00:00.000Z');
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO assistant_first_seen/);
      expect(sql).toMatch(/ON CONFLICT \(user_sub, profile\)/);
    });
  });
});
