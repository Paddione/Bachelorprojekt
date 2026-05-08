// website/src/components/inbox/type-meta.ts
// Shared per-type accent palette + labels. Per spec §4.3 the oklch(...)
// values listed below are intentionally hardcoded (not in the global token
// set). Do not move these to hex.

import type { InboxType } from '../../lib/messaging-db';

export interface TypeMeta {
  /** German label used in lists, sidebar, status copy. */
  label: string;
  /** Pill / list-row background tint. */
  pillBg: string;
  /** Pill / list-row text colour. */
  pillFg: string;
  /** Sidebar dot fill. */
  dotBg: string;
  /** Detail-pane avatar background tint. */
  avatarBg: string;
  /** Detail-pane avatar text/icon colour. */
  avatarFg: string;
  /** Glyph/emoji for non-person types. Empty string = render initials. */
  avatarGlyph: string;
}

export const TYPE_META: Record<InboxType, TypeMeta> = {
  registration: {
    label: 'Anfragen',
    pillBg: 'oklch(0.80 0.09 75 / 0.14)',
    pillFg: 'oklch(0.86 0.09 75)',
    dotBg: 'oklch(0.86 0.09 75)',
    avatarBg: 'oklch(0.80 0.09 75 / 0.18)',
    avatarFg: 'oklch(0.86 0.09 75)',
    avatarGlyph: '',
  },
  booking: {
    label: 'Buchungen',
    pillBg: 'oklch(0.80 0.06 160 / 0.14)',
    pillFg: 'oklch(0.86 0.06 160)',
    dotBg: 'oklch(0.86 0.06 160)',
    avatarBg: 'oklch(0.80 0.06 160 / 0.18)',
    avatarFg: 'oklch(0.86 0.06 160)',
    avatarGlyph: '',
  },
  contact: {
    label: 'Kontakt',
    pillBg: 'rgba(255,255,255,0.06)',
    pillFg: 'var(--fg-soft)',
    dotBg: 'var(--fg-soft)',
    avatarBg: 'rgba(255,255,255,0.08)',
    avatarFg: 'var(--fg)',
    avatarGlyph: '',
  },
  bug: {
    label: 'Bugs',
    pillBg: 'oklch(0.7 0.12 25 / 0.16)',
    pillFg: 'oklch(0.85 0.1 25)',
    dotBg: 'oklch(0.85 0.1 25)',
    avatarBg: 'oklch(0.7 0.12 25 / 0.2)',
    avatarFg: 'oklch(0.92 0.08 25)',
    avatarGlyph: '🐞',
  },
  meeting_finalize: {
    label: 'Meetings',
    pillBg: 'oklch(0.7 0.12 235 / 0.18)',
    pillFg: 'oklch(0.85 0.1 235)',
    dotBg: 'oklch(0.85 0.1 235)',
    avatarBg: 'oklch(0.7 0.12 235 / 0.22)',
    avatarFg: 'oklch(0.92 0.08 235)',
    avatarGlyph: '📅',
  },
  user_message: {
    label: 'Nachrichten',
    pillBg: 'oklch(0.65 0.12 290 / 0.18)',
    pillFg: 'oklch(0.85 0.1 290)',
    dotBg: 'oklch(0.85 0.1 290)',
    avatarBg: 'oklch(0.65 0.12 290 / 0.22)',
    avatarFg: 'oklch(0.92 0.08 290)',
    avatarGlyph: '',
  },
};

// Fixed display order for the sidebar (Alle is rendered separately first).
export const TYPE_ORDER: ReadonlyArray<{ id: InboxType; label: string }> = [
  { id: 'registration',     label: 'Anfragen' },
  { id: 'booking',          label: 'Buchungen' },
  { id: 'bug',              label: 'Bugs' },
  { id: 'user_message',     label: 'Nachrichten' },
  { id: 'meeting_finalize', label: 'Meetings' },
  { id: 'contact',          label: 'Kontakt' },
];

export function initialsOf(name: string | undefined | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}
