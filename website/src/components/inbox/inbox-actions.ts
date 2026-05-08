// website/src/components/inbox/inbox-actions.ts
// Pure helpers describing which API action a given inbox-item type maps to
// for the primary "done" / quick-action flow, plus a guard that decides
// whether a row qualifies for the inline check-icon shortcut.
//
// Kept free of DOM / Svelte deps so it's straightforward to unit-test.

import type { InboxType, InboxStatus } from '../../lib/messaging-db';

/**
 * The action name posted to /api/admin/inbox/[id]/action when the user
 * clicks the primary "Erledigt" / approve / archive button.
 *
 * Returns null for `bug` because the bug flow requires an extra resolution
 * note, which has to be entered in the detail pane — not in a quick action.
 */
export function primaryActionFor(type: InboxType): string | null {
  switch (type) {
    case 'registration':     return 'approve_registration';
    case 'booking':          return 'approve_booking';
    case 'contact':          return 'archive_contact';
    case 'meeting_finalize': return 'finalize_meeting';
    case 'user_message':     return 'close_user_message';
    case 'bug':              return null; // requires note
    default:                 return null;
  }
}

/**
 * Whether the inline "Erledigt" check-icon should be rendered for a row.
 *
 * Conditions:
 *  - we're on the "pending" status tab (other tabs only contain finalised
 *    items the API will reject with 409 anyway), and
 *  - the type has a primary action that does not require additional input
 *    (i.e. anything except `bug`).
 */
export function canQuickDone(type: InboxType, activeStatus: InboxStatus): boolean {
  if (activeStatus !== 'pending') return false;
  return primaryActionFor(type) !== null;
}
