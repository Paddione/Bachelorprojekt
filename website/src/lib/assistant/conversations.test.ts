import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const ensure = vi.fn();
vi.mock('../website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('./schema', () => ({ ensureAssistantSchema: (...a: unknown[]) => ensure(...a) }));

import { getOrCreateActiveConversation, appendMessage, loadHistory } from './conversations';

beforeEach(() => { query.mockReset(); ensure.mockReset(); });

describe('assistant/conversations', () => {
  it('getOrCreateActiveConversation: returns existing id and refreshes last_active_at', async () => {
    ensure.mockResolvedValue(undefined);
    query
      .mockResolvedValueOnce({ rows: [{ id: 'c-1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const out = await getOrCreateActiveConversation('user-1', 'admin');
    expect(out).toEqual({ id: 'c-1' });
    expect(query.mock.calls[0][0] as string).toMatch(/ORDER BY last_active_at DESC LIMIT 1/);
    expect(query.mock.calls[1][0] as string).toMatch(/UPDATE assistant_conversations/);
  });

  it('getOrCreateActiveConversation: inserts a new conversation when none exists', async () => {
    ensure.mockResolvedValue(undefined);
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'c-2' }] });
    const out = await getOrCreateActiveConversation('user-1', 'admin');
    expect(out).toEqual({ id: 'c-2' });
    const insertSql = query.mock.calls[1][0] as string;
    expect(insertSql).toMatch(/INSERT INTO assistant_conversations/);
  });

  it('appendMessage: serialises the role/content/proposed_action + returns created_at as ISO', async () => {
    ensure.mockResolvedValue(undefined);
    query.mockResolvedValueOnce({ rows: [{ id: 'm-1', created_at: new Date('2026-05-01T10:00:00Z') }] });
    const proposed = { actionId: 'a-1', targetLabel: 'T', summary: 'S', payload: {} };
    const out = await appendMessage('c-1', 'user', 'hi', proposed);
    expect(out).toMatchObject({
      id: 'm-1',
      conversationId: 'c-1',
      role: 'user',
      content: 'hi',
      proposedAction: proposed,
    });
    expect(out.createdAt).toBe('2026-05-01T10:00:00.000Z');
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[3]).toEqual(proposed);
  });

  it('appendMessage: passes null when no proposedAction is provided', async () => {
    ensure.mockResolvedValue(undefined);
    query.mockResolvedValueOnce({ rows: [{ id: 'm-1', created_at: new Date() }] });
    await appendMessage('c-1', 'assistant', 'hello');
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[3]).toBeNull();
  });

  it('loadHistory: maps rows in order, undefined when no proposed_action', async () => {
    ensure.mockResolvedValue(undefined);
    query.mockResolvedValueOnce({
      rows: [
        { id: 'm-1', role: 'user', content: 'a', proposed_action: null, created_at: new Date('2026-05-01T10:00:00Z') },
        { id: 'm-2', role: 'assistant', content: 'b', proposed_action: { kind: 'x' }, created_at: new Date('2026-05-01T10:01:00Z') },
      ],
    });
    const out = await loadHistory('c-1', 10);
    expect(out).toHaveLength(2);
    expect(out[0].proposedAction).toBeUndefined();
    expect(out[1].proposedAction).toEqual({ kind: 'x' });
    const params = query.mock.calls[0][1] as unknown[];
    expect(params).toEqual(['c-1', 10]);
  });
});
