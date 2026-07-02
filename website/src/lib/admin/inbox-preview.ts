import type { InboxItem } from '../messaging-db';

export interface InboxPreviewRow {
  id: number;
  type: string;
  title: string;
  ageLabel: string;
  href: string;
}

const TYPE_TITLES: Record<string, string> = {
  registration: 'Neue Registrierung',
  booking: 'Buchungsanfrage',
  contact: 'Kontaktanfrage',
  bug: 'Bug gemeldet',
  meeting_finalize: 'Meeting abschließen',
  user_message: 'Nachricht',
};

export function relativeAge(from: Date, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  return `${Math.round(hrs / 24)} d`;
}

function itemTitle(item: InboxItem): string {
  const payload = (item.payload ?? {}) as Record<string, unknown>;
  const raw = payload.title ?? payload.subject ?? payload.name;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return TYPE_TITLES[item.type] ?? 'Postfach-Eintrag';
}

export function toInboxPreview(items: InboxItem[], limit = 5, now: Date = new Date()): InboxPreviewRow[] {
  return items.slice(0, limit).map((item) => ({
    id: item.id,
    type: item.type,
    title: itemTitle(item),
    ageLabel: relativeAge(new Date(item.created_at), now),
    href: `/admin/inbox?type=${encodeURIComponent(item.type)}`,
  }));
}
