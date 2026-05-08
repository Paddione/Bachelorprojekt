// website/src/components/inbox/inbox-actions.test.ts
import { describe, it, expect } from 'vitest';
import { primaryActionFor, canQuickDone } from './inbox-actions';
import type { InboxType } from '../../lib/messaging-db';

describe('inbox-actions: primaryActionFor', () => {
  it.each<[InboxType, string]>([
    ['registration',     'approve_registration'],
    ['booking',          'approve_booking'],
    ['contact',          'archive_contact'],
    ['meeting_finalize', 'finalize_meeting'],
    ['user_message',     'close_user_message'],
  ])('maps %s → %s', (type, action) => {
    expect(primaryActionFor(type)).toBe(action);
  });

  it('returns null for bug (resolution note required)', () => {
    expect(primaryActionFor('bug')).toBeNull();
  });
});

describe('inbox-actions: canQuickDone', () => {
  it('allows quick-done on the pending tab for non-bug types', () => {
    const types: InboxType[] = [
      'registration', 'booking', 'contact', 'meeting_finalize', 'user_message',
    ];
    for (const t of types) {
      expect(canQuickDone(t, 'pending')).toBe(true);
    }
  });

  it('blocks quick-done on bug rows even on the pending tab', () => {
    expect(canQuickDone('bug', 'pending')).toBe(false);
  });

  it('blocks quick-done on the actioned tab — items already finalised', () => {
    const types: InboxType[] = [
      'registration', 'booking', 'contact', 'bug', 'meeting_finalize', 'user_message',
    ];
    for (const t of types) {
      expect(canQuickDone(t, 'actioned')).toBe(false);
    }
  });

  it('blocks quick-done on the archived tab', () => {
    expect(canQuickDone('contact', 'archived')).toBe(false);
    expect(canQuickDone('user_message', 'archived')).toBe(false);
  });
});
