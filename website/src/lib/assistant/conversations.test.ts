import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./schema', () => ({ ensureAssistantSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { getOrCreateActiveConversation, appendMessage, loadHistory } from './conversations';

beforeEach(() => {
  query.mockReset();
});

describe('assistant/conversations', () => {
  describe('getOrCreateActiveConversation', () => {
    it('returns the existing conversation and bumps last_active_at', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
        .mockResolvedValueOnce({ rowCount: 1 });
      const out = await getOrCreateActiveConversation('user-1', 'admin');
      expect(out).toEqual({ id: 'c1' });
      const secondSql = query.mock.calls[1][0] as string;
      expect(secondSql).toMatch(/UPDATE assistant_conversations SET last_active_at/);
    });

    it('inserts a new conversation when none exists', async () => {
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'c2' }] });
      const out = await getOrCreateActiveConversation('user-1', 'admin');
      expect(out).toEqual({ id: 'c2' });
      const insertSql = query.mock.calls[1][0] as string;
      expect(insertSql).toMatch(/INSERT INTO assistant_conversations/);
    });
  });

  describe('appendMessage', () => {
    it('persists the message and returns the new id + ISO timestamp', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'm1', created_at: new Date('2026-01-01T00:00:00Z') }] });
      const out = await appendMessage('c1', 'user', 'hello', undefined);
      expect(out.id).toBe('m1');
      expect(out.role).toBe('user');
      expect(out.content).toBe('hello');
      expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z');
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO assistant_messages/);
    });
  });

  describe('loadHistory', () => {
    it('returns mapped messages ordered by created_at ASC', async () => {
      query.mockResolvedValueOnce({
        rows: [
          { id: 'm1', role: 'user', content: 'a', proposed_action: null, created_at: new Date('2026-01-01T00:00:00Z') },
          { id: 'm2', role: 'assistant', content: 'b', proposed_action: { type: 'noop' }, created_at: new Date('2026-01-01T00:00:01Z') },
        ],
      });
      const out = await loadHistory('c1', 50);
      expect(out).toHaveLength(2);
      expect(out[1].proposedAction).toEqual({ type: 'noop' });
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/ORDER BY created_at ASC/);
      expect(sql).toMatch(/LIMIT \$2/);
    });

    it('falls back to the default limit when none is given', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await loadHistory('c1');
      const params = query.mock.calls[0][1] as unknown[];
      expect(params).toEqual(['c1', 50]);
    });
  });
});
