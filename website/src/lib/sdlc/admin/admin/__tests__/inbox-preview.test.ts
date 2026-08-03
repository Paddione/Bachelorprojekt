import { describe, it, expect } from 'vitest';
import { toInboxPreview, relativeAge } from '../inbox-preview';
import type { InboxItem } from '../../messaging-db';

function item(over: Partial<InboxItem>): InboxItem {
  return {
    id: 1, type: 'contact', status: 'pending', reference_id: null, reference_table: null,
    bug_ticket_id: null, payload: {}, created_at: new Date('2026-07-02T10:00:00Z'),
    actioned_at: null, actioned_by: null, is_test_data: false, ...over,
  } as InboxItem;
}

describe('toInboxPreview', () => {
  it('returns an empty array for no items', () => {
    expect(toInboxPreview([])).toEqual([]);
  });

  it('caps to the limit, newest first (input already sorted)', () => {
    const items = [item({ id: 1 }), item({ id: 2 }), item({ id: 3 })];
    expect(toInboxPreview(items, 2).map((r) => r.id)).toEqual([1, 2]);
  });

  it('derives a title from payload.subject, falling back to a type label', () => {
    expect(toInboxPreview([item({ payload: { subject: 'Hallo' } })])[0].title).toBe('Hallo');
    expect(toInboxPreview([item({ type: 'bug', payload: {} })])[0].title).toBe('Bug gemeldet');
  });

  it('links to the filtered inbox and labels age', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const row = toInboxPreview([item({ type: 'contact' })], 5, now)[0];
    expect(row.href).toBe('/admin/inbox?type=contact');
    expect(relativeAge(new Date('2026-07-02T10:00:00Z'), now)).toBe('2 h');
  });
});
