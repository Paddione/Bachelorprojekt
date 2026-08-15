// website/src/components/inbox/inbox-shortcuts.ts
// Pure keyboard handler for the admin inbox.
//
// `handle({ event, ctx })` returns the next state action without ever touching
// the DOM, making the table easy to unit-test.

import type { InboxType, InboxStatus } from '../../lib/messaging-db';

export type InboxAction =
  | { kind: 'select-next' }
  | { kind: 'select-prev' }
  | { kind: 'set-type';   type: InboxType | 'all' }
  | { kind: 'set-status'; status: InboxStatus }
  | { kind: 'focus-search' }
  | { kind: 'clear' }
  | { kind: 'action';     name: 'primary' | 'secondary' }
  | { kind: 'send-reply' }
  | { kind: 'focus-reply' }
  | { kind: 'toggle-help' };

export interface ShortcutCtx {
  /** Type of the currently-selected item (undefined if no selection). */
  selectedType?: InboxType | null;
  /** True when a previous keystroke started a `g …` chord. */
  awaitingG: boolean;
  /** True if the device has a fine pointer (mouse/trackpad). */
  pointerFine: boolean;
}

export interface ShortcutResult {
  /** The action to dispatch (null if no actionable shortcut). */
  action: InboxAction | null;
  /** Updated chord state — caller should overwrite ctx.awaitingG with this. */
  awaitingG: boolean;
  /** True when the original event should be preventDefault'd. */
  preventDefault: boolean;
}

const NOOP: ShortcutResult = { action: null, awaitingG: false, preventDefault: false };

/**
 * Returns the action to dispatch for a given keydown event + current context.
 * Pure: never touches `document`, `window`, `localStorage`, etc.
 *
 * Pass an event-like object with at least:
 *   - `key`           (string)
 *   - `metaKey`/`ctrlKey`/`shiftKey` (boolean)
 *   - `target`        ({ tagName?: string; getAttribute?: (a: string) => string | null })
 */
export function handle(input: {
  event: {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    target?: { tagName?: string; getAttribute?: (attr: string) => string | null } | null;
  };
  ctx: ShortcutCtx;
}): ShortcutResult {
  const { event, ctx } = input;
  if (!ctx.pointerFine) return NOOP;

  const key = event.key;
  const inField = isEditableTarget(event.target);
  const isReply = inField && getTestId(event.target) === 'inbox-reply';

  // ⌘⏎ / Ctrl⏎ → send reply (only meaningful inside the reply textarea).
  if ((event.metaKey || event.ctrlKey) && key === 'Enter') {
    if (isReply) return { action: { kind: 'send-reply' }, awaitingG: false, preventDefault: true };
    return NOOP;
  }

  // Escape always works (clears focus / chord / search).
  if (key === 'Escape') {
    return { action: { kind: 'clear' }, awaitingG: false, preventDefault: false };
  }

  // Inside an input/textarea: swallow everything else.
  if (inField) return { ...NOOP, awaitingG: false };

  // `g …` chord state machine.
  if (ctx.awaitingG) {
    const chord = resolveGChord(key);
    if (chord) {
      return { action: { kind: 'set-type', type: chord }, awaitingG: false, preventDefault: true };
    }
    // Unknown second key: drop the chord silently, fall through.
    return { ...NOOP, awaitingG: false };
  }
  if (key === 'g') {
    return { action: null, awaitingG: true, preventDefault: true };
  }

  // Selection navigation.
  if (key === 'j' || key === 'ArrowDown') {
    return { action: { kind: 'select-next' }, awaitingG: false, preventDefault: true };
  }
  if (key === 'k' || key === 'ArrowUp') {
    return { action: { kind: 'select-prev' }, awaitingG: false, preventDefault: true };
  }

  // Status tab switches.
  if (key === '1') return { action: { kind: 'set-status', status: 'pending' },  awaitingG: false, preventDefault: true };
  if (key === '2') return { action: { kind: 'set-status', status: 'actioned' }, awaitingG: false, preventDefault: true };
  if (key === '3') return { action: { kind: 'set-status', status: 'archived' }, awaitingG: false, preventDefault: true };

  // Focus the search input.
  if (key === '/') {
    return { action: { kind: 'focus-search' }, awaitingG: false, preventDefault: true };
  }

  // Help.
  if (key === '?') {
    return { action: { kind: 'toggle-help' }, awaitingG: false, preventDefault: true };
  }

  // Primary action — works on every type.
  if (key === 'A' || key === 'a') {
    return { action: { kind: 'action', name: 'primary' }, awaitingG: false, preventDefault: true };
  }

  // Secondary "decline" — only registration / booking.
  if (key === 'D' || key === 'd') {
    if (ctx.selectedType === 'registration' || ctx.selectedType === 'booking') {
      return { action: { kind: 'action', name: 'secondary' }, awaitingG: false, preventDefault: true };
    }
    return NOOP;
  }

  // "Erledigt / archive" — only contact / user_message.
  if (key === 'E' || key === 'e') {
    if (ctx.selectedType === 'contact' || ctx.selectedType === 'user_message') {
      return { action: { kind: 'action', name: 'primary' }, awaitingG: false, preventDefault: true };
    }
    return NOOP;
  }

  // Focus reply textarea (user_message only).
  if (key === 'R' || key === 'r') {
    if (ctx.selectedType === 'user_message') {
      return { action: { kind: 'focus-reply' }, awaitingG: false, preventDefault: true };
    }
    return NOOP;
  }

  // Enter triggers primary action when not in a textarea (we already returned
  // above if inField is true).
  if (key === 'Enter' && !event.shiftKey) {
    return { action: { kind: 'action', name: 'primary' }, awaitingG: false, preventDefault: true };
  }

  return NOOP;
}

function resolveGChord(key: string): InboxType | 'all' | null {
  switch (key) {
    case '1': return 'registration';
    case '2': return 'booking';
    case '3': return 'bug';
    case '4': return 'user_message';
    case '5': return 'meeting_finalize';
    case '6': return 'contact';
    case 'a': case 'A': return 'all';
    default: return null;
  }
}

function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const t = (target as { tagName?: string }).tagName;
  if (typeof t !== 'string') return false;
  const tag = t.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function getTestId(target: unknown): string | null {
  if (!target || typeof target !== 'object') return null;
  const fn = (target as { getAttribute?: (attr: string) => string | null }).getAttribute;
  if (typeof fn !== 'function') return null;
  return fn.call(target, 'data-testid');
}
