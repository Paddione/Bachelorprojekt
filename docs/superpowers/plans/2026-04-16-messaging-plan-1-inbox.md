# Messaging Plan 1 — DB Schema + Admin Inbox

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Mattermost approval workflows with a unified admin inbox backed by Postgres.

**Architecture:** Seven new tables appended to `k3d/website-schema.yaml`. A new `messaging-db.ts` library handles inbox CRUD. A new `/admin/inbox` page renders a Svelte island (`InboxApp.svelte`) with filter sidebar and action cards. The four event-creating endpoints (contact, register, booking, bug-report) each get one `createInboxItem()` call in place of their Mattermost calls. The old `api/mattermost/` handler files are deleted.

**Tech Stack:** Astro 5 SSR, Svelte 5 (runes), TypeScript, `pg` pool, existing `auth.ts` session helpers.

---

## File Map

| Action | Path |
|---|---|
| Modify | `k3d/website-schema.yaml` |
| Create | `website/src/lib/messaging-db.ts` |
| Create | `website/src/pages/api/admin/inbox.ts` |
| Create | `website/src/pages/api/admin/inbox/[id]/action.ts` |
| Create | `website/src/components/InboxApp.svelte` |
| Create | `website/src/pages/admin/inbox.astro` |
| Modify | `website/src/pages/api/contact.ts` |
| Modify | `website/src/pages/api/register.ts` |
| Modify | `website/src/pages/api/booking.ts` |
| Modify | `website/src/pages/api/bug-report.ts` |
| Modify | `website/src/layouts/AdminLayout.astro` |
| Delete | `website/src/pages/api/mattermost/actions.ts` |
| Delete | `website/src/pages/api/mattermost/dialog-submit.ts` |
| Delete | `website/src/pages/api/mattermost/slash/meeting.ts` |
| Delete | `website/src/pages/admin/mattermost.astro` |

---

## Task 1: Extend DB schema with 7 new tables

**Files:**
- Modify: `k3d/website-schema.yaml`

- [ ] **Step 1: Append the 7 new tables** after the last existing `CREATE TABLE` block (before the closing `EOSQL` line):

```sql
      -- ── Messaging System ──────────────────────────────────────────────

      CREATE TABLE IF NOT EXISTS inbox_items (
        id              SERIAL PRIMARY KEY,
        type            TEXT NOT NULL CHECK (type IN ('registration','booking','contact','bug','meeting_finalize','user_message')),
        status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','actioned','archived')),
        reference_id    TEXT,
        reference_table TEXT,
        payload         JSONB,
        created_at      TIMESTAMPTZ DEFAULT now(),
        actioned_at     TIMESTAMPTZ,
        actioned_by     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_inbox_items_status ON inbox_items(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS message_threads (
        id              SERIAL PRIMARY KEY,
        customer_id     UUID REFERENCES customers(id),
        subject         TEXT,
        created_at      TIMESTAMPTZ DEFAULT now(),
        last_message_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id                   SERIAL PRIMARY KEY,
        thread_id            INT NOT NULL REFERENCES message_threads(id),
        sender_id            TEXT NOT NULL,
        sender_role          TEXT NOT NULL CHECK (sender_role IN ('admin','user')),
        body                 TEXT NOT NULL,
        created_at           TIMESTAMPTZ DEFAULT now(),
        read_at              TIMESTAMPTZ,
        notification_sent_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, id ASC);

      CREATE TABLE IF NOT EXISTS chat_rooms (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        created_by  TEXT NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT now(),
        archived_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS chat_room_members (
        room_id     INT NOT NULL REFERENCES chat_rooms(id),
        customer_id UUID NOT NULL REFERENCES customers(id),
        joined_at   TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (room_id, customer_id)
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id                   SERIAL PRIMARY KEY,
        room_id              INT NOT NULL REFERENCES chat_rooms(id),
        sender_id            TEXT NOT NULL,
        sender_name          TEXT NOT NULL,
        body                 TEXT NOT NULL,
        created_at           TIMESTAMPTZ DEFAULT now(),
        notification_sent_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id, id ASC);

      CREATE TABLE IF NOT EXISTS chat_message_reads (
        message_id  INT NOT NULL REFERENCES chat_messages(id),
        customer_id UUID NOT NULL REFERENCES customers(id),
        read_at     TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (message_id, customer_id)
      );
```

- [ ] **Step 2: Verify the YAML is valid**

```bash
cd /home/patrick/Bachelorprojekt
python3 -c "import yaml, sys; yaml.safe_load(open('k3d/website-schema.yaml'))" && echo OK
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add k3d/website-schema.yaml
git commit -m "feat(schema): add 7 messaging tables to website DB"
```

---

## Task 2: Create messaging-db.ts (inbox functions)

**Files:**
- Create: `website/src/lib/messaging-db.ts`

- [ ] **Step 1: Create the file**

```typescript
// website/src/lib/messaging-db.ts
// DB operations for the inbox, messaging, and chat room system.
// Uses the same shared-db connection as website-db.ts.

import pg from 'pg';
const { Pool } = pg;

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

const pool = new Pool({ connectionString: DB_URL });

// ── Types ─────────────────────────────────────────────────────────────────────

export type InboxType =
  | 'registration' | 'booking' | 'contact' | 'bug' | 'meeting_finalize' | 'user_message';
export type InboxStatus = 'pending' | 'actioned' | 'archived';

export interface InboxItem {
  id: number;
  type: InboxType;
  status: InboxStatus;
  reference_id: string | null;
  reference_table: string | null;
  payload: Record<string, unknown>;
  created_at: Date;
  actioned_at: Date | null;
  actioned_by: string | null;
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

export async function createInboxItem(params: {
  type: InboxType;
  referenceId?: string;
  referenceTable?: string;
  payload: Record<string, unknown>;
}): Promise<InboxItem> {
  const { rows } = await pool.query<InboxItem>(
    `INSERT INTO inbox_items (type, reference_id, reference_table, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.type, params.referenceId ?? null, params.referenceTable ?? null, params.payload],
  );
  return rows[0];
}

export async function listInboxItems(filter: {
  status?: InboxStatus;
  type?: InboxType;
}): Promise<InboxItem[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filter.status) {
    conditions.push(`status = $${conditions.length + 1}`);
    values.push(filter.status);
  }
  if (filter.type) {
    conditions.push(`type = $${conditions.length + 1}`);
    values.push(filter.type);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query<InboxItem>(
    `SELECT * FROM inbox_items ${where} ORDER BY created_at DESC`,
    values,
  );
  return rows;
}

export async function getInboxItem(id: number): Promise<InboxItem | null> {
  const { rows } = await pool.query<InboxItem>(
    'SELECT * FROM inbox_items WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function updateInboxItemStatus(
  id: number,
  status: InboxStatus,
  actionedBy?: string,
): Promise<void> {
  await pool.query(
    `UPDATE inbox_items
     SET status = $1, actioned_at = $2, actioned_by = $3
     WHERE id = $4`,
    [status, status !== 'pending' ? new Date() : null, actionedBy ?? null, id],
  );
}

export async function countPendingByType(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ type: string; count: string }>(
    `SELECT type, count(*) AS count FROM inbox_items WHERE status = 'pending' GROUP BY type`,
  );
  const out: Record<string, number> = {};
  for (const row of rows) out[row.type] = parseInt(row.count, 10);
  return out;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors on the new file (existing errors, if any, are pre-existing).

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/messaging-db.ts
git commit -m "feat(messaging-db): inbox CRUD functions"
```

---

## Task 3: Create GET /api/admin/inbox.ts

**Files:**
- Create: `website/src/pages/api/admin/inbox.ts`

- [ ] **Step 1: Create the file**

```typescript
// website/src/pages/api/admin/inbox.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listInboxItems, countPendingByType } from '../../../lib/messaging-db';
import type { InboxType, InboxStatus } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const status = (url.searchParams.get('status') as InboxStatus | null) ?? 'pending';
  const type = (url.searchParams.get('type') as InboxType | null) ?? undefined;

  const [items, counts] = await Promise.all([
    listInboxItems({ status, type }),
    countPendingByType(),
  ]);

  return new Response(JSON.stringify({ items, counts }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/inbox.ts
git commit -m "feat(api): GET /api/admin/inbox"
```

---

## Task 4: Create POST /api/admin/inbox/[id]/action.ts

This file contains the orchestration logic migrated from `actions.ts` and `dialog-submit.ts`, with all Mattermost calls and InvoiceNinja calls removed.

**Files:**
- Create: `website/src/pages/api/admin/inbox/[id]/action.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p /home/patrick/Bachelorprojekt/website/src/pages/api/admin/inbox
```

```typescript
// website/src/pages/api/admin/inbox/[id]/action.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getInboxItem, updateInboxItemStatus } from '../../../../../lib/messaging-db';
import { createUser, sendPasswordResetEmail } from '../../../../../lib/keycloak';
import { createCalendarEvent } from '../../../../../lib/caldav';
import { createTalkRoom, inviteGuestByEmail } from '../../../../../lib/talk';
import { scheduleReminder } from '../../../../../lib/reminders';
import { sendRegistrationApproved, sendRegistrationDeclined, sendEmail } from '../../../../../lib/email';
import { upsertCustomer, resolveBugTicket } from '../../../../../lib/website-db';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
const PROD_DOMAIN = process.env.PROD_DOMAIN || '';
const SITE_URL   = process.env.SITE_URL || '';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = parseInt(params.id!, 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  }

  const item = await getInboxItem(id);
  if (!item) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }
  if (item.status !== 'pending') {
    return new Response(JSON.stringify({ error: 'Already actioned' }), { status: 409 });
  }

  const body = await request.json() as { action: string; note?: string };
  const { action, note } = body;

  try {
    switch (action) {

      case 'approve_registration': {
        const p = item.payload as { email: string; firstName: string; lastName: string; phone?: string; company?: string };
        const fullName = `${p.firstName} ${p.lastName}`;

        const result = await createUser({ email: p.email, firstName: p.firstName, lastName: p.lastName, phone: p.phone, company: p.company });
        if (!result.success || !result.userId) {
          return new Response(JSON.stringify({ error: `Keycloak-Fehler: ${result.error}` }), { status: 500 });
        }
        await sendPasswordResetEmail(result.userId);
        await sendRegistrationApproved(p.email, fullName);
        await upsertCustomer({ name: fullName, email: p.email, phone: p.phone, company: p.company, keycloakUserId: result.userId });
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true, message: `${fullName} freigeschaltet` }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'decline_registration': {
        const p = item.payload as { email: string; firstName: string; lastName: string };
        await sendRegistrationDeclined(p.email, `${p.firstName} ${p.lastName}`);
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      case 'approve_booking': {
        const p = item.payload as {
          name: string; email: string; phone?: string; typeLabel: string;
          slotStart: string; slotEnd: string; slotDisplay: string; date: string;
        };
        const meetingStart = new Date(p.slotStart);
        const meetingEnd   = new Date(p.slotEnd);
        const dateFormatted = new Date(p.date + 'T00:00:00').toLocaleDateString('de-DE', {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
        });
        const statusParts: string[] = [];

        const room = await createTalkRoom({
          name: `${p.typeLabel}: ${p.name}`,
          description: `${p.typeLabel} mit ${p.name} (${p.email}) am ${dateFormatted}, ${p.slotDisplay}`,
        });
        if (room) {
          await inviteGuestByEmail(room.token, p.email);
          statusParts.push(`Talk-Raum erstellt: ${room.url}`);
        } else {
          statusParts.push('Talk-Raum konnte nicht erstellt werden');
        }

        const calEvent = await createCalendarEvent({
          summary: `${p.typeLabel}: ${p.name}`,
          description: `Termin mit ${p.name} (${p.email})\nTyp: ${p.typeLabel}${room ? `\nMeeting: ${room.url}` : ''}`,
          start: meetingStart, end: meetingEnd,
          attendeeEmail: p.email, attendeeName: p.name,
        });
        statusParts.push(calEvent ? 'Kalendereintrag erstellt' : 'Kalendereintrag fehlgeschlagen');

        if (room) {
          await scheduleReminder({ email: p.email, name: p.name, meetingStart, meetingUrl: room.url, meetingType: p.typeLabel });
          statusParts.push('Erinnerung geplant (10 Min. vorher)');
        }

        const meetingLinkHtml = room
          ? `<p><a href="${room.url}" style="display:inline-block;background:#e8c870;color:#0f1623;padding:12px 24px;border-radius:25px;text-decoration:none;font-weight:bold">Zum Meeting beitreten</a></p>`
          : '';
        await sendEmail({
          to: p.email,
          subject: `Termin bestätigt: ${p.typeLabel} am ${dateFormatted}`,
          text: `Hallo ${p.name},\n\nIhr Termin wurde bestätigt!\n\n  Typ:     ${p.typeLabel}\n  Datum:   ${dateFormatted}\n  Uhrzeit: ${p.slotDisplay}${room ? `\n\nIhr Meeting-Link:\n${room.url}\n\nSie erhalten 10 Minuten vor dem Termin eine Erinnerung.` : ''}\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
          html: `<p>Hallo ${p.name},</p><p><strong>Ihr Termin wurde bestätigt!</strong></p><table style="border-collapse:collapse;margin:16px 0"><tr><td style="padding:4px 12px 4px 0;color:#aabbcc">Typ</td><td>${p.typeLabel}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#aabbcc">Datum</td><td>${dateFormatted}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#aabbcc">Uhrzeit</td><td>${p.slotDisplay}</td></tr></table>${meetingLinkHtml}<p>Mit freundlichen Grüßen<br>${BRAND_NAME}</p>`,
        });
        statusParts.push('Bestätigungs-E-Mail versendet');
        await upsertCustomer({ name: p.name, email: p.email, phone: p.phone });
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true, details: statusParts }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'decline_booking': {
        const p = item.payload as { name: string; email: string; typeLabel: string; slotDisplay: string; date: string };
        const dateFormatted = new Date(p.date + 'T00:00:00').toLocaleDateString('de-DE', {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
        });
        await sendEmail({
          to: p.email,
          subject: `Zu Ihrer Terminanfrage bei ${BRAND_NAME}`,
          text: `Hallo ${p.name},\n\nleider können wir den angefragten Termin (${p.typeLabel} am ${dateFormatted}, ${p.slotDisplay}) nicht bestätigen.\n\nBitte wählen Sie einen alternativen Termin unter https://web.${PROD_DOMAIN}/termin oder kontaktieren Sie uns direkt.\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
        });
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      case 'archive_contact': {
        await updateInboxItemStatus(id, 'archived', session.preferred_username);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      case 'resolve_bug': {
        const resolveNote = note?.trim() ?? '';
        if (!resolveNote) {
          return new Response(JSON.stringify({ error: 'Bitte geben Sie eine Notiz an.' }), { status: 400 });
        }
        if (resolveNote.length > 500) {
          return new Response(JSON.stringify({ error: 'Max. 500 Zeichen.' }), { status: 400 });
        }
        const p = item.payload as { ticketId: string; reporterEmail: string; brand: string };
        await resolveBugTicket(p.ticketId, resolveNote);
        const BRAND_INBOX: Record<string, string> = {
          mentolder: 'info@mentolder.de',
          korczewski: 'info@korczewski.de',
        };
        await sendEmail({
          to: BRAND_INBOX[p.brand] ?? 'info@mentolder.de',
          subject: `[${p.ticketId}] Erledigt`,
          text: `Ticket ${p.ticketId} wurde als erledigt markiert.\n\nNotiz:\n${resolveNote}`,
          replyTo: p.reporterEmail,
        });
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      case 'finalize_meeting': {
        const p = item.payload as {
          customerName: string; customerEmail: string; meetingType: string;
          meetingDate: string; roomToken?: string; projectId?: string;
        };
        const res = await fetch(`${SITE_URL}/api/meeting/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: p.customerName, customerEmail: p.customerEmail,
            meetingType: p.meetingType, meetingDate: p.meetingDate,
            roomToken: p.roomToken ?? undefined,
            projectId: p.projectId ?? undefined,
          }),
        });
        if (!res.ok) {
          return new Response(JSON.stringify({ error: 'Meeting-Finalisierung fehlgeschlagen.' }), { status: 500 });
        }
        const data = await res.json() as { results?: string[] };
        await updateInboxItemStatus(id, 'actioned', session.preferred_username);
        return new Response(JSON.stringify({ success: true, results: data.results ?? [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unbekannte Aktion: ${action}` }), { status: 400 });
    }
  } catch (err) {
    console.error(`[inbox action ${action}] id=${id}`, err);
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), { status: 500 });
  }
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/inbox/
git commit -m "feat(api): POST /api/admin/inbox/[id]/action"
```

---

## Task 5: Create InboxApp.svelte

A single Svelte 5 island that manages the full inbox UI (filter sidebar + card list). Fetches from the API, renders cards inline.

**Files:**
- Create: `website/src/components/InboxApp.svelte`

- [ ] **Step 1: Create the file**

```svelte
<script lang="ts">
  import type { InboxItem, InboxType, InboxStatus } from '../lib/messaging-db';

  // Server passes initial data via props to avoid a flash of empty content
  const { initialItems, initialCounts }: {
    initialItems: InboxItem[];
    initialCounts: Record<string, number>;
  } = $props();

  let items = $state<InboxItem[]>(initialItems);
  let counts = $state<Record<string, number>>(initialCounts);
  let activeType = $state<InboxType | ''>('');
  let activeStatus = $state<InboxStatus>('pending');
  let loadingAction = $state<number | null>(null);
  let errors = $state<Record<number, string>>({});
  let noteInputId = $state<number | null>(null);
  let noteText = $state('');

  const TYPE_LABELS: Record<string, string> = {
    registration: 'Registrierung',
    booking: 'Buchung',
    contact: 'Kontakt',
    bug: 'Bug',
    meeting_finalize: 'Meeting',
    user_message: 'Nachricht',
  };
  const TYPE_COLORS: Record<string, string> = {
    registration: '#4ade80',
    booking: '#60a5fa',
    contact: '#f59e0b',
    bug: '#f87171',
    meeting_finalize: '#a78bfa',
    user_message: '#34d399',
  };

  const totalPending = $derived(Object.values(counts).reduce((a, b) => a + b, 0));

  async function reload() {
    const p = new URLSearchParams({ status: activeStatus });
    if (activeType) p.set('type', activeType);
    const res = await fetch(`/api/admin/inbox?${p}`);
    const data = await res.json() as { items: InboxItem[]; counts: Record<string, number> };
    items = data.items;
    counts = data.counts;
  }

  function setType(t: InboxType | '') {
    activeType = t;
    reload();
  }

  function setStatus(s: InboxStatus) {
    activeStatus = s;
    reload();
  }

  async function executeAction(item: InboxItem, action: string, note?: string) {
    loadingAction = item.id;
    errors = { ...errors, [item.id]: '' };
    try {
      const res = await fetch(`/api/admin/inbox/${item.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        errors = { ...errors, [item.id]: data.error ?? 'Fehler' };
      } else {
        items = items.filter(i => i.id !== item.id);
        counts = { ...counts, [item.type]: Math.max(0, (counts[item.type] ?? 1) - 1) };
        noteInputId = null;
        noteText = '';
      }
    } catch {
      errors = { ...errors, [item.id]: 'Netzwerkfehler' };
    } finally {
      loadingAction = null;
    }
  }

  function relativeTime(date: Date | string): string {
    const d = new Date(date);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return 'gerade eben';
    const min = Math.floor(sec / 60);
    if (min < 60) return `vor ${min} Min.`;
    const h = Math.floor(min / 60);
    if (h < 24) return `vor ${h} Std.`;
    return `vor ${Math.floor(h / 24)} Tagen`;
  }

  function summary(item: InboxItem): { title: string; sub: string } {
    const p = item.payload as Record<string, string>;
    switch (item.type) {
      case 'registration': return { title: `${p.firstName} ${p.lastName}`, sub: `${p.email}${p.company ? ` · ${p.company}` : ''}` };
      case 'booking':      return { title: p.name, sub: `${p.typeLabel} · ${p.slotDisplay}` };
      case 'contact':      return { title: p.name, sub: (p.message ?? '').slice(0, 80) };
      case 'bug':          return { title: p.ticketId, sub: (p.description ?? '').slice(0, 80) };
      case 'meeting_finalize': return { title: p.customerName, sub: `${p.meetingType} · ${p.meetingDate}` };
      case 'user_message': return { title: p.senderName ?? 'Nutzer', sub: (p.message ?? '').slice(0, 80) };
      default:             return { title: item.type, sub: '' };
    }
  }
</script>

<div class="inbox-layout">
  <!-- Sidebar -->
  <aside class="sidebar">
    <h2>Inbox</h2>
    <div class="filter-group">
      {#each ([['', 'Alle', totalPending], ['registration', 'Registrierung', counts.registration ?? 0], ['booking', 'Buchung', counts.booking ?? 0], ['contact', 'Kontakt', counts.contact ?? 0], ['bug', 'Bug', counts.bug ?? 0], ['meeting_finalize', 'Meeting', counts.meeting_finalize ?? 0], ['user_message', 'Nachricht', counts.user_message ?? 0]] as [t, label, count])}
        <button
          class="filter-btn {activeType === t ? 'active' : ''}"
          onclick={() => setType(t as InboxType | '')}
        >
          {label}
          {#if count > 0}<span class="badge">{count}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="status-group">
      {#each ([['pending','Offen'], ['actioned','Erledigt'], ['archived','Archiv']] as [s, label])}
        <button
          class="status-btn {activeStatus === s ? 'active' : ''}"
          onclick={() => setStatus(s as InboxStatus)}
        >{label}</button>
      {/each}
    </div>
  </aside>

  <!-- Feed -->
  <main class="feed">
    {#if items.length === 0}
      <p class="empty">Keine Einträge.</p>
    {:else}
      {#each items as item (item.id)}
        {@const { title, sub } = summary(item)}
        {@const color = TYPE_COLORS[item.type] ?? '#888'}
        <div class="card" style="border-left: 3px solid {color}">
          <div class="card-header">
            <span class="type-badge" style="background:{color}22;color:{color}">{TYPE_LABELS[item.type] ?? item.type}</span>
            <span class="ts">{relativeTime(item.created_at)}</span>
          </div>
          <div class="card-body">
            <strong>{title}</strong>
            {#if sub}<span class="sub">{sub}</span>{/if}
          </div>
          {#if errors[item.id]}
            <p class="err">{errors[item.id]}</p>
          {/if}
          {#if noteInputId === item.id}
            <div class="note-wrap">
              <textarea bind:value={noteText} placeholder="Was wurde gemacht? (max. 500 Zeichen)" maxlength="500" rows="2"></textarea>
              <div class="note-actions">
                <button onclick={() => { noteInputId = null; noteText = ''; }}>Abbrechen</button>
                <button class="btn-primary" disabled={!noteText.trim() || loadingAction === item.id}
                  onclick={() => executeAction(item, 'resolve_bug', noteText)}>
                  {loadingAction === item.id ? '…' : 'Speichern'}
                </button>
              </div>
            </div>
          {:else}
            <div class="actions">
              {#if item.type === 'registration'}
                <button class="btn-approve" disabled={loadingAction === item.id} onclick={() => executeAction(item, 'approve_registration')}>
                  {loadingAction === item.id ? '…' : '✓ Freischalten'}
                </button>
                <button class="btn-decline" disabled={loadingAction === item.id} onclick={() => executeAction(item, 'decline_registration')}>
                  {loadingAction === item.id ? '…' : '✗ Ablehnen'}
                </button>
              {:else if item.type === 'booking'}
                <button class="btn-approve" disabled={loadingAction === item.id} onclick={() => executeAction(item, 'approve_booking')}>
                  {loadingAction === item.id ? '…' : '✓ Bestätigen'}
                </button>
                <button class="btn-decline" disabled={loadingAction === item.id} onclick={() => executeAction(item, 'decline_booking')}>
                  {loadingAction === item.id ? '…' : '✗ Ablehnen'}
                </button>
              {:else if item.type === 'contact'}
                <button class="btn-secondary" disabled={loadingAction === item.id} onclick={() => executeAction(item, 'archive_contact')}>
                  {loadingAction === item.id ? '…' : 'Archivieren'}
                </button>
              {:else if item.type === 'bug'}
                <button class="btn-approve" onclick={() => { noteInputId = item.id; }}>Erledigt</button>
              {:else if item.type === 'meeting_finalize'}
                <button class="btn-approve" disabled={loadingAction === item.id} onclick={() => executeAction(item, 'finalize_meeting')}>
                  {loadingAction === item.id ? '…' : '▶ Finalisieren'}
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </main>
</div>

<style>
  .inbox-layout { display: flex; gap: 24px; height: 100%; }
  .sidebar { width: 200px; flex-shrink: 0; }
  .sidebar h2 { font-size: 18px; margin: 0 0 16px; }
  .filter-group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; }
  .filter-btn { background: transparent; border: none; text-align: left; padding: 7px 10px; border-radius: 6px; cursor: pointer; color: #ccc; font-size: 13px; display: flex; justify-content: space-between; }
  .filter-btn.active { background: #2a2a3e; color: #fff; }
  .filter-btn:hover:not(.active) { background: #1e1e2e; }
  .badge { background: #7c6ff7; color: #fff; border-radius: 10px; padding: 0 6px; font-size: 11px; }
  .status-group { display: flex; gap: 4px; }
  .status-btn { flex: 1; background: #1e1e2e; border: none; padding: 5px; border-radius: 4px; cursor: pointer; color: #999; font-size: 12px; }
  .status-btn.active { background: #2a2a3e; color: #fff; }
  .feed { flex: 1; overflow-y: auto; }
  .empty { color: #666; text-align: center; margin-top: 48px; }
  .card { background: #1e1e2e; border-radius: 8px; padding: 14px 16px; margin-bottom: 8px; }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .type-badge { font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; letter-spacing: .05em; }
  .ts { font-size: 11px; color: #555; }
  .card-body strong { display: block; font-size: 14px; color: #e8e8f0; }
  .sub { font-size: 12px; color: #888; display: block; margin-top: 2px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  button { padding: 5px 12px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: 600; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .btn-approve { background: #4ade80; color: #000; }
  .btn-decline { background: #f87171; color: #fff; }
  .btn-secondary { background: #374151; color: #ccc; }
  .btn-primary { background: #7c6ff7; color: #fff; }
  .err { font-size: 12px; color: #f87171; margin: 6px 0 0; }
  .note-wrap { margin-top: 10px; }
  .note-wrap textarea { width: 100%; background: #111827; color: #e8e8f0; border: 1px solid #374151; border-radius: 4px; padding: 8px; font-size: 13px; resize: vertical; box-sizing: border-box; }
  .note-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
</style>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/InboxApp.svelte
git commit -m "feat(ui): InboxApp Svelte component"
```

---

## Task 6: Create /admin/inbox.astro

**Files:**
- Create: `website/src/pages/admin/inbox.astro`

- [ ] **Step 1: Create the file**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import InboxApp from '../../components/InboxApp.svelte';
import { getSession, isAdmin, getLoginUrl } from '../../lib/auth';
import { listInboxItems, countPendingByType } from '../../lib/messaging-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const [initialItems, initialCounts] = await Promise.all([
  listInboxItems({ status: 'pending' }),
  countPendingByType(),
]);
---

<AdminLayout title="Inbox">
  <div style="height: calc(100vh - 120px)">
    <InboxApp {initialItems} {initialCounts} client:load />
  </div>
</AdminLayout>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/admin/inbox.astro
git commit -m "feat(admin): /admin/inbox page"
```

---

## Task 7: Update contact.ts — replace Mattermost call

**Files:**
- Modify: `website/src/pages/api/contact.ts`

- [ ] **Step 1: Replace the Mattermost import and call**

Remove the line:
```typescript
import { postWebhook, postInteractiveMessage, getFirstTeamId, getChannelByName } from '../../lib/mattermost';
```

Add instead:
```typescript
import { createInboxItem } from '../../lib/messaging-db';
```

Replace the entire Mattermost block (the `const teamId = ...` through the closing `}` of the `else { await postWebhook(...) }`) with:

```typescript
    await createInboxItem({
      type: 'contact',
      payload: { name, email, phone: phone ?? null, type, typeLabel, message },
    });
```

The `sendEmail` call after it stays unchanged.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/contact.ts
git commit -m "feat(contact): write inbox_item instead of Mattermost post"
```

---

## Task 8: Update register.ts — replace Mattermost call

**Files:**
- Modify: `website/src/pages/api/register.ts`

- [ ] **Step 1: Replace the Mattermost import**

Remove:
```typescript
import { postWebhook, postInteractiveMessage, getFirstTeamId, getChannelByName } from '../../lib/mattermost';
```

Add:
```typescript
import { createInboxItem } from '../../lib/messaging-db';
```

- [ ] **Step 2: Replace the Mattermost block**

Remove the entire block starting at `const teamId = await getFirstTeamId()` through the closing `}` of the `else { await postWebhook(...) }`.

Replace with:
```typescript
    await createInboxItem({
      type: 'registration',
      payload: { firstName, lastName, email, phone: phone ?? null, company: company ?? null, message: message ?? null },
    });
```

The `sendRegistrationConfirmation` call below it stays unchanged.

- [ ] **Step 3: Verify TypeScript compiles and commit**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
git add website/src/pages/api/register.ts
git commit -m "feat(register): write inbox_item instead of Mattermost post"
```

---

## Task 9: Update booking.ts — replace Mattermost call

**Files:**
- Modify: `website/src/pages/api/booking.ts`

- [ ] **Step 1: Replace the Mattermost import**

Remove:
```typescript
import { postWebhook, postInteractiveMessage, getFirstTeamId, getChannelByName } from '../../lib/mattermost';
```

Add:
```typescript
import { createInboxItem } from '../../lib/messaging-db';
```

- [ ] **Step 2: Find the Mattermost block in booking.ts**

It will look like `const teamId = await getFirstTeamId()` followed by an `if (channelId) { await postInteractiveMessage(...) } else { await postWebhook(...) }`. Replace that entire block with:

```typescript
    const typeLabel = TYPE_LABELS[type] || type;
    await createInboxItem({
      type: 'booking',
      payload: {
        name, email, phone: phone ?? null, type, typeLabel,
        slotStart: slotStart ?? null, slotEnd: slotEnd ?? null,
        slotDisplay: slotDisplay ?? null, date: date ?? null,
        serviceKey: serviceKey ?? null, message: message ?? null,
      },
    });
```

Note: `TYPE_LABELS` is already defined at the top of booking.ts so `typeLabel` will be correct.

- [ ] **Step 3: Verify TypeScript compiles and commit**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
git add website/src/pages/api/booking.ts
git commit -m "feat(booking): write inbox_item instead of Mattermost post"
```

---

## Task 10: Update bug-report.ts — add inbox item after ticket insert

**Files:**
- Modify: `website/src/pages/api/bug-report.ts`

- [ ] **Step 1: Add the import at the top of the file**

After the existing imports, add:
```typescript
import { createInboxItem } from '../../lib/messaging-db';
```

- [ ] **Step 2: Find the line that calls `insertBugTicket(...)` and add `createInboxItem` after it**

After `const ticket = await insertBugTicket(...)` (or whatever the return variable name is), add:

```typescript
    await createInboxItem({
      type: 'bug',
      referenceId: ticketId,
      referenceTable: 'bug_tickets',
      payload: {
        ticketId,
        category,
        categoryLabel: CATEGORY_LABELS[category] ?? category,
        reporterEmail: email,
        description,
        url,
        brand: BRAND,
      },
    });
```

Use the same `ticketId` variable that was computed by `generateTicketId()` earlier in the handler.

- [ ] **Step 3: Verify TypeScript compiles and commit**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
git add website/src/pages/api/bug-report.ts
git commit -m "feat(bug-report): write inbox_item on ticket creation"
```

---

## Task 11: Update AdminLayout.astro nav

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 1: In the `navGroups` array, in the `'Betrieb'` group, replace the Mattermost entry with Inbox and Nachrichten**

Replace:
```typescript
      { href: '/admin/mattermost',   label: 'Mattermost',    icon: '💬' },
```

With:
```typescript
      { href: '/admin/inbox',        label: 'Inbox',         icon: '📬' },
      { href: '/admin/nachrichten',  label: 'Nachrichten',   icon: '💬' },
      { href: '/admin/raeume',       label: 'Räume',         icon: '🏠' },
```

- [ ] **Step 2: Commit**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(nav): replace Mattermost link with Inbox/Nachrichten/Räume"
```

---

## Task 12: Delete old Mattermost handler files

**Files:**
- Delete: `website/src/pages/api/mattermost/actions.ts`
- Delete: `website/src/pages/api/mattermost/dialog-submit.ts`
- Delete: `website/src/pages/api/mattermost/slash/meeting.ts`
- Delete: `website/src/pages/admin/mattermost.astro`

- [ ] **Step 1: Delete the files**

```bash
cd /home/patrick/Bachelorprojekt
git rm website/src/pages/api/mattermost/actions.ts
git rm website/src/pages/api/mattermost/dialog-submit.ts
git rm website/src/pages/api/mattermost/slash/meeting.ts
git rm website/src/pages/admin/mattermost.astro
```

- [ ] **Step 2: Check nothing else imports from these files**

```bash
grep -r "mattermost/actions\|mattermost/dialog-submit\|mattermost/slash" website/src/ --include="*.ts" --include="*.astro"
```
Expected: no output.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete Mattermost API handler files and admin page"
```

---

## Validation

- [ ] Run `task workspace:validate` — expected: no kustomize errors
- [ ] Visit `/admin/inbox` — expected: page loads, sidebar shows type filters
- [ ] Submit the contact form — expected: inbox item appears in `/admin/inbox`
- [ ] Click "Archivieren" — expected: card disappears from pending list
- [ ] Submit a test registration — expected: inbox item with Freischalten/Ablehnen buttons
