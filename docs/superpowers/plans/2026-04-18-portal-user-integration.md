# Portal User Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat tab-based `/portal` with a sidebar + main content layout that surfaces chat rooms, projects, improved meetings/files/bookings views, external service cards, and account management.

**Architecture:** Single `portal.astro` page routes via `?section=` query param. A new `PortalLayout.astro` mirrors `AdminLayout.astro` with portal-specific nav groups and badge counts. Section components are SSR Astro components; task toggling in Projekte uses a plain `<form method="post">` to avoid Svelte.

**Tech Stack:** Astro 5 SSR, Svelte (sidebar only), PostgreSQL via `pg`, Nextcloud WebDAV, Stripe, CalDAV.

---

## File Map

**Create:**
- `website/src/layouts/PortalLayout.astro` — sidebar layout for portal (mirrors AdminLayout)
- `website/src/components/portal/OverviewSection.astro` — stat cards + service shortcuts + upcoming bookings
- `website/src/components/portal/NachrichtenSection.astro` — room inbox list with last message preview
- `website/src/components/portal/BesprechungenSection.astro` — meetings with type/date, transcript link
- `website/src/components/portal/DateienSection.astro` — files with download + open-in-Nextcloud
- `website/src/components/portal/TermineSection.astro` — bookings with "Neuen Termin buchen" CTA
- `website/src/components/portal/ProjekteSection.astro` — projects with interactive task checkboxes
- `website/src/components/portal/RechnungenSection.astro` — invoices without admin modal
- `website/src/components/portal/DiensteSection.astro` — named service cards (fixes Whiteboard link)
- `website/src/components/portal/KontoSection.astro` — Keycloak account + Meine Daten links
- `website/src/pages/api/portal/nachrichten.ts` — GET rooms + last message + unread count
- `website/src/pages/api/portal/projekte.ts` — GET user's projects with tasks
- `website/src/pages/api/portal/projekttasks/[id]/done.ts` — POST toggle task done/aktiv

**Modify:**
- `website/src/lib/messaging-db.ts` — add `listRoomsWithInboxData`
- `website/src/lib/website-db.ts` — update `Meeting` type + `getMeetingsForClient`; add `listProjectsForCustomer`, `togglePortalTaskDone`
- `website/src/pages/portal.astro` — full rewrite using PortalLayout + section routing

---

## Task 1: Add `listRoomsWithInboxData` to messaging-db.ts

**Files:**
- Modify: `website/src/lib/messaging-db.ts`

- [ ] **Step 1: Add the type and function**

Open `website/src/lib/messaging-db.ts` and add after the `listRoomsForCustomer` function (around line 282):

```typescript
export interface RoomInboxItem {
  id: number;
  name: string;
  lastMessageBody: string | null;
  lastMessageSenderName: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
}

export async function listRoomsWithInboxData(customerId: string): Promise<RoomInboxItem[]> {
  const { rows } = await pool.query<RoomInboxItem>(
    `SELECT
       r.id,
       r.name,
       lm.body                AS "lastMessageBody",
       lm.sender_name         AS "lastMessageSenderName",
       lm.created_at          AS "lastMessageAt",
       COALESCE(unread.cnt, 0)::int AS "unreadCount"
     FROM chat_rooms r
     JOIN chat_room_members m ON m.room_id = r.id AND m.customer_id = $1
     LEFT JOIN LATERAL (
       SELECT body, sender_name, created_at
       FROM chat_messages
       WHERE room_id = r.id
       ORDER BY id DESC
       LIMIT 1
     ) lm ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt
       FROM chat_messages cm
       WHERE cm.room_id = r.id
         AND (cm.sender_customer_id IS NULL OR cm.sender_customer_id <> $1)
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_reads cr
           WHERE cr.message_id = cm.id AND cr.customer_id = $1
         )
     ) unread ON true
     WHERE r.archived_at IS NULL
     ORDER BY COALESCE(lm.created_at, r.created_at) DESC`,
    [customerId],
  );
  return rows;
}
```

- [ ] **Step 2: Type-check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep messaging-db
```

Expected: no output (no errors in messaging-db.ts).

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/messaging-db.ts
git commit -m "feat(portal): add listRoomsWithInboxData to messaging-db"
```

---

## Task 2: Update Meeting type and getMeetingsForClient in website-db.ts

**Files:**
- Modify: `website/src/lib/website-db.ts`

- [ ] **Step 1: Update the Meeting interface (~line 98)**

Replace the existing `Meeting` interface:

```typescript
export interface Meeting {
  id: string;
  customerId: string;
  status: string;
  meetingType: string;
  scheduledAt: Date | null;
  createdAt: Date;
  released_at: Date | null;
  projectId: string | null;
  projectName: string | null;
}
```

- [ ] **Step 2: Update getMeetingsForClient SELECT (~line 296)**

Replace the `baseSelect` string inside `getMeetingsForClient`:

```typescript
  const baseSelect = `
    SELECT m.id, m.customer_id as "customerId", m.status, m.released_at,
           m.meeting_type as "meetingType",
           m.scheduled_at as "scheduledAt",
           m.created_at   as "createdAt",
           m.project_id as "projectId", p.name as "projectName"
    FROM meetings m
    JOIN customers c ON m.customer_id = c.id
    LEFT JOIN projects p ON m.project_id = p.id
    WHERE c.email = $1`;
```

- [ ] **Step 3: Type-check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep website-db
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(portal): extend Meeting type with meetingType/scheduledAt/createdAt"
```

---

## Task 3: Add listProjectsForCustomer and togglePortalTaskDone to website-db.ts

**Files:**
- Modify: `website/src/lib/website-db.ts`

- [ ] **Step 1: Add new types and functions**

Add after the `deleteProjectTask` function (around line 1058):

```typescript
// ── Portal: user-scoped project access ───────────────────────────────────────

export interface PortalProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
  tasks: PortalTask[];
}

export interface PortalTask {
  id: string;
  name: string;
  status: string;
  isUserTask: boolean; // true = assigned to session user, can toggle
}

export async function listProjectsForCustomer(keycloakUserId: string): Promise<PortalProject[]> {
  await initProjectTables();

  // Resolve customer id from keycloak user id
  const cust = await pool.query<{ id: string }>(
    `SELECT id FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakUserId],
  );
  if (!cust.rows[0]) return [];
  const customerId = cust.rows[0].id;

  // Projects assigned to this customer
  const projects = await pool.query<{ id: string; name: string; description: string | null; status: string; due_date: Date | null }>(
    `SELECT id, name, description, status, due_date
     FROM projects
     WHERE customer_id = $1 AND status NOT IN ('archiviert')
     ORDER BY created_at DESC`,
    [customerId],
  );

  const result: PortalProject[] = [];
  for (const p of projects.rows) {
    const tasks = await pool.query<{ id: string; name: string; status: string; customer_id: string | null }>(
      `SELECT id, name, status, customer_id FROM project_tasks WHERE project_id = $1 ORDER BY created_at ASC`,
      [p.id],
    );
    result.push({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      dueDate: p.due_date,
      tasks: tasks.rows.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        isUserTask: t.customer_id === customerId,
      })),
    });
  }
  return result;
}

export async function togglePortalTaskDone(taskId: string, keycloakUserId: string): Promise<{ ok: boolean }> {
  await initProjectTables();

  // Resolve customer id
  const cust = await pool.query<{ id: string }>(
    `SELECT id FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakUserId],
  );
  if (!cust.rows[0]) return { ok: false };
  const customerId = cust.rows[0].id;

  // Verify task is assigned to this customer
  const task = await pool.query<{ status: string }>(
    `SELECT status FROM project_tasks WHERE id = $1 AND customer_id = $2`,
    [taskId, customerId],
  );
  if (!task.rows[0]) return { ok: false };

  const newStatus = task.rows[0].status === 'erledigt' ? 'aktiv' : 'erledigt';
  await pool.query(
    `UPDATE project_tasks SET status = $1, updated_at = now() WHERE id = $2`,
    [newStatus, taskId],
  );
  return { ok: true };
}
```

- [ ] **Step 2: Type-check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep website-db
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(portal): add listProjectsForCustomer and togglePortalTaskDone"
```

---

## Task 4: API route GET /api/portal/nachrichten

**Files:**
- Create: `website/src/pages/api/portal/nachrichten.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { getCustomerByEmail, listRoomsWithInboxData } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const rooms = await listRoomsWithInboxData(customer.id);
  return new Response(JSON.stringify(rooms), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Type-check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "portal/nachrichten"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/portal/nachrichten.ts
git commit -m "feat(portal): add GET /api/portal/nachrichten"
```

---

## Task 5: API route GET /api/portal/projekte

**Files:**
- Create: `website/src/pages/api/portal/projekte.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { listProjectsForCustomer } from '../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const projects = await listProjectsForCustomer(session.sub);
  return new Response(JSON.stringify(projects), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Type-check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "portal/projekte"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/portal/projekte.ts
git commit -m "feat(portal): add GET /api/portal/projekte"
```

---

## Task 6: API route POST /api/portal/projekttasks/[id]/done

**Files:**
- Create: `website/src/pages/api/portal/projekttasks/[id]/done.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { togglePortalTaskDone } from '../../../../../lib/website-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const taskId = params.id;
  if (!taskId) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

  const result = await togglePortalTaskDone(taskId, session.sub);
  if (!result.ok) return new Response(JSON.stringify({ error: 'Forbidden or not found' }), { status: 403 });

  const referer = request.headers.get('referer') ?? '/portal?section=projekte';
  return new Response(null, { status: 303, headers: { Location: referer } });
};
```

- [ ] **Step 2: Type-check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "projekttasks"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/portal/projekttasks/
git commit -m "feat(portal): add POST /api/portal/projekttasks/[id]/done"
```

---

## Task 7: Create PortalLayout.astro

**Files:**
- Create: `website/src/layouts/PortalLayout.astro`

- [ ] **Step 1: Create the layout**

Model closely after `AdminLayout.astro` (read it at `website/src/layouts/AdminLayout.astro`). Key differences: portal-specific nav groups, badge counts on Nachrichten and Unterschriften items, user info in sidebar header, no collapsible toggle, no BugReportWidget.

```astro
---
import '../styles/global.css';
import { config } from '../config/index';
import type { UserSession } from '../lib/auth';

interface Props {
  title: string;
  section: string;
  session: UserSession;
  unreadMessages: number;
  pendingSignatures: number;
}

const { title, section, session, unreadMessages, pendingSignatures } = Astro.props;

const brandWord = config.meta.siteTitle.replace(/\.de$/i, '').toLowerCase();

const icons: Record<string, string> = {
  overview:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="5" height="5" rx="0.5"/><rect x="9" y="2" width="5" height="5" rx="0.5"/><rect x="2" y="9" width="5" height="5" rx="0.5"/><rect x="9" y="9" width="5" height="5" rx="0.5"/></svg>`,
  nachrichten:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h12v8H9.5L8 13l-1.5-2H2z"/></svg>`,
  besprechungen: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="1.5" width="5" height="7" rx="2.5"/><path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5v2M6 14.5h4"/></svg>`,
  dateien:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5v3h3"/></svg>`,
  unterschriften:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11c1-2 2-3 3-1s2 2 3 0 2-3 4-2M3 14h10"/></svg>`,
  termine:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 7h12M5.5 1.5v3M10.5 1.5v3"/></svg>`,
  rechnungen:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 1.5h8v13l-2-1.5-2 1.5-2-1.5-2 1.5z"/><path d="M6 6h4M6 8.5h4M6 11h2"/></svg>`,
  projekte:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 2.5h5v2.5h-5V2.5z"/><rect x="3" y="2.5" width="10" height="12" rx="1"/><path d="M5.5 7.5h5M5.5 10.5h5M5.5 13.5h3"/></svg>`,
  onboarding:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5" r="3"/><path d="M1 14a5 5 0 0 1 10 0"/><path d="M11.5 9l1.5 1.5L16 8"/></svg>`,
  dienste:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5"/></svg>`,
  konto:         `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="5" r="3"/><path d="M2.5 14.5a5.5 5.5 0 0 1 11 0"/></svg>`,
};

const navGroups = [
  {
    label: null,
    items: [{ id: 'overview', label: 'Übersicht', icon: 'overview', badge: 0 }],
  },
  {
    label: 'Kommunikation',
    items: [
      { id: 'nachrichten',   label: 'Nachrichten',   icon: 'nachrichten',   badge: unreadMessages },
      { id: 'besprechungen', label: 'Besprechungen', icon: 'besprechungen', badge: 0 },
    ],
  },
  {
    label: 'Dokumente',
    items: [
      { id: 'dateien',       label: 'Dateien',       icon: 'dateien',       badge: 0 },
      { id: 'unterschriften',label: 'Unterschriften', icon: 'unterschriften',badge: pendingSignatures },
    ],
  },
  {
    label: 'Abrechnung',
    items: [
      { id: 'termine',    label: 'Termine',    icon: 'termine',    badge: 0 },
      { id: 'rechnungen', label: 'Rechnungen', icon: 'rechnungen', badge: 0 },
    ],
  },
  {
    label: 'Zusammenarbeit',
    items: [
      { id: 'projekte',   label: 'Projekte',   icon: 'projekte',   badge: 0 },
      { id: 'onboarding', label: 'Onboarding', icon: 'onboarding', badge: 0 },
    ],
  },
  {
    label: 'Dienste',
    items: [{ id: 'dienste', label: 'Alle Dienste', icon: 'dienste', badge: 0 }],
  },
];
---

<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <title>{title} | {config.meta.siteTitle}</title>
  </head>
  <body style="min-height:100vh; background:var(--ink-900); color:var(--fg); display:flex; font-family:var(--font-sans);">

    <!-- Sidebar -->
    <aside id="portal-sidebar" style="width:13rem; flex-shrink:0; min-height:100vh; background:var(--ink-850); border-right:1px solid var(--line); display:flex; flex-direction:column;">

      <!-- User info header -->
      <div style="padding:18px 14px 16px; border-bottom:1px solid var(--line);">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
          <div style="width:32px; height:32px; border-radius:50%; background:var(--brass-d); border:1.5px solid var(--brass); color:var(--brass); font-size:13px; font-weight:700; font-family:var(--font-mono); display:flex; align-items:center; justify-content:center; flex-shrink:0; line-height:1;">
            {session.name.charAt(0).toUpperCase()}
          </div>
          <div style="min-width:0;">
            <div style="font-size:13px; font-weight:600; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{session.name.split(' ')[0]}</div>
            <div style="font-family:var(--font-mono); font-size:9px; color:var(--mute); letter-spacing:0.04em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{session.email}</div>
          </div>
        </div>
        <a href="/" style="display:flex; align-items:center; gap:8px; text-decoration:none; color:var(--mute); font-size:11px;">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="width:12px; height:12px; flex-shrink:0;" aria-hidden="true"><path d="M1.5 8.5l6.5-6 6.5 6"/><path d="M3.5 7.5v6.5h3.5v-4h2v4h3.5V7.5"/></svg>
          <span style="font-family:var(--font-sans); font-size:11px;">{brandWord}</span>
        </a>
      </div>

      <!-- Nav -->
      <nav style="flex:1; overflow-y:auto; padding:12px 8px; display:flex; flex-direction:column; gap:16px;">
        {navGroups.map(group => (
          <div>
            {group.label && (
              <p style="padding:0 10px; margin-bottom:4px; font-family:var(--font-mono); font-size:9px; font-weight:500; color:var(--mute-2); text-transform:uppercase; letter-spacing:0.14em;">{group.label}</p>
            )}
            <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:1px;">
              {group.items.map(item => {
                const active = section === item.id;
                return (
                  <li>
                    <a
                      href={`/portal?section=${item.id}`}
                      title={item.label}
                      style={`display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:8px; text-decoration:none; font-size:13px; font-weight:500; transition:background 0.1s ease, color 0.1s ease; ${active ? 'background:var(--brass-d); color:var(--brass);' : 'color:var(--fg-soft);'}`}
                    >
                      <span
                        style={`flex-shrink:0; width:16px; height:16px; display:flex; align-items:center; justify-content:center; ${active ? 'color:var(--brass);' : 'color:var(--mute);'}`}
                        set:html={icons[item.icon]}
                      />
                      <span style="flex:1;">{item.label}</span>
                      {item.badge > 0 && (
                        <span style="background:var(--brass); color:var(--ink-900); border-radius:999px; font-size:10px; font-weight:700; padding:1px 6px; line-height:1.4; font-family:var(--font-mono);">{item.badge}</span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <!-- Footer -->
      <div style="padding:10px 8px 12px; border-top:1px solid var(--line); display:flex; flex-direction:column; gap:1px;">
        <a href="/portal?section=konto" style={`display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:8px; text-decoration:none; font-size:12px; color:var(--mute); transition:background 0.1s ease, color 0.1s ease; ${section === 'konto' ? 'background:var(--brass-d); color:var(--brass);' : ''}`}>
          <span style="flex-shrink:0; width:14px; height:14px;" set:html={icons.konto} />
          <span>Konto</span>
        </a>
        <a href="/api/auth/logout" style="display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:8px; text-decoration:none; font-size:12px; color:var(--mute); transition:background 0.1s ease, color 0.1s ease;">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; flex-shrink:0;" aria-hidden="true">
            <path d="M6 12H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/>
            <path d="M10.5 11l3-3-3-3M13.5 8H6"/>
          </svg>
          <span>Abmelden</span>
        </a>
      </div>
    </aside>

    <!-- Main -->
    <main style="flex:1; min-height:100vh; overflow-y:auto;">
      <slot />
    </main>

  </body>
</html>
```

- [ ] **Step 2: Type-check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep PortalLayout
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add website/src/layouts/PortalLayout.astro
git commit -m "feat(portal): add PortalLayout with grouped sidebar and badge counts"
```

---

## Task 8: Create OverviewSection.astro

**Files:**
- Create: `website/src/components/portal/OverviewSection.astro`

- [ ] **Step 1: Create the file**

```astro
---
import type { UserSession } from '../../lib/auth';
import type { ClientBooking } from '../../lib/caldav';

interface Props {
  session: UserSession;
  nextBooking: ClientBooking | null;
  openInvoices: number;
  unreadMessages: number;
  onboardingPct: number;
  ncBase: string;
  wikiUrl: string;
  vaultUrl: string;
}

const { session, nextBooking, openInvoices, unreadMessages, onboardingPct, ncBase, wikiUrl, vaultUrl } = Astro.props;

const services = [
  ...(ncBase ? [
    { href: `${ncBase}/apps/files/`,       label: 'Dateien',    desc: 'Nextcloud' },
    { href: `${ncBase}/apps/calendar/`,    label: 'Kalender',   desc: 'Nextcloud' },
    { href: `${ncBase}/apps/spreed/`,      label: 'Talk',       desc: 'Video & Chat' },
    { href: `${ncBase}/apps/whiteboard/`,  label: 'Whiteboard', desc: 'Nextcloud' },
  ] : []),
  ...(wikiUrl  ? [{ href: wikiUrl,  label: 'Wiki',       desc: 'Dokumentation' }] : []),
  ...(vaultUrl ? [{ href: vaultUrl, label: 'Passwörter', desc: 'Vaultwarden' }] : []),
];
---

<div class="pt-10 pb-20 px-8 max-w-4xl">
  <h1 class="text-2xl font-bold text-light font-serif mb-6">Willkommen, {session.name.split(' ')[0]}</h1>

  <!-- Stat cards -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
    <a href="/portal?section=termine" class="p-4 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors">
      <div class="text-base font-bold text-gold truncate">
        {nextBooking ? nextBooking.start.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—'}
      </div>
      <div class="text-xs text-muted mt-0.5">Nächster Termin</div>
    </a>
    <a href="/portal?section=rechnungen" class={`p-4 bg-dark-light rounded-xl border hover:border-gold/40 transition-colors ${openInvoices > 0 ? 'border-amber-700/60' : 'border-dark-lighter'}`}>
      <div class={`text-base font-bold ${openInvoices > 0 ? 'text-amber-400' : 'text-muted'}`}>{openInvoices > 0 ? `${openInvoices} offen` : 'Keine'}</div>
      <div class="text-xs text-muted mt-0.5">Rechnungen</div>
    </a>
    <a href="/portal?section=nachrichten" class={`p-4 bg-dark-light rounded-xl border hover:border-gold/40 transition-colors ${unreadMessages > 0 ? 'border-blue-700/60' : 'border-dark-lighter'}`}>
      <div class={`text-base font-bold ${unreadMessages > 0 ? 'text-blue-400' : 'text-muted'}`}>{unreadMessages > 0 ? `${unreadMessages} neu` : 'Keine'}</div>
      <div class="text-xs text-muted mt-0.5">Nachrichten</div>
    </a>
    <a href="/portal?section=onboarding" class="p-4 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors">
      <div class={`text-base font-bold ${onboardingPct === 100 ? 'text-green-400' : 'text-light'}`}>{onboardingPct}%</div>
      <div class="text-xs text-muted mt-0.5">Onboarding</div>
    </a>
  </div>

  <!-- External services -->
  {services.length > 0 && (
    <div class="mb-8">
      <p class="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Externe Dienste</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {services.map(s => (
          <a href={s.href} target="_blank" rel="noopener noreferrer"
             class="flex flex-col items-center gap-1 p-4 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors text-center">
            <span class="text-xs font-semibold text-light">{s.label}</span>
            <span class="text-xs text-muted">{s.desc}</span>
          </a>
        ))}
      </div>
    </div>
  )}

  <!-- Upcoming bookings -->
  {nextBooking && (
    <div>
      <p class="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Nächster Termin</p>
      <div class="flex items-center gap-3 p-4 bg-dark-light rounded-xl border border-dark-lighter">
        <div class="flex-1">
          <div class="text-light font-medium">{nextBooking.summary}</div>
          <div class="text-sm text-muted mt-1">
            {nextBooking.start.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            {' · '}
            {nextBooking.start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            {' – '}
            {nextBooking.end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <span class="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">
          {nextBooking.status === 'TENTATIVE' ? 'Anfrage' : 'Bestätigt'}
        </span>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/portal/OverviewSection.astro
git commit -m "feat(portal): add OverviewSection with stat cards and service shortcuts"
```

---

## Task 9: Create NachrichtenSection.astro

**Files:**
- Create: `website/src/components/portal/NachrichtenSection.astro`

- [ ] **Step 1: Create the file**

```astro
---
import type { RoomInboxItem } from '../../lib/messaging-db';

interface Props {
  rooms: RoomInboxItem[];
}
const { rooms } = Astro.props;
---

<div class="pt-10 pb-20 px-8 max-w-2xl">
  <h2 class="text-xl font-bold text-light font-serif mb-6">Nachrichten</h2>

  {rooms.length === 0 ? (
    <p class="text-muted">Keine Nachrichtenräume vorhanden.</p>
  ) : (
    <ul class="flex flex-col gap-2">
      {rooms.map(room => (
        <li>
          <a href={`/portal/raum/${room.id}`}
             class="flex items-center gap-3 p-4 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors">
            <!-- Avatar -->
            <div class="w-9 h-9 rounded-full bg-dark border border-dark-lighter flex items-center justify-center font-bold font-mono text-sm text-muted flex-shrink-0">
              {room.name.charAt(0).toUpperCase()}
            </div>
            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-0.5">
                <span class={`text-sm font-semibold truncate ${room.unreadCount > 0 ? 'text-light' : 'text-fg-soft'}`}>
                  {room.name}
                </span>
                {room.lastMessageAt && (
                  <span class="text-xs text-muted flex-shrink-0 ml-2">
                    {new Date(room.lastMessageAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                  </span>
                )}
              </div>
              {room.lastMessageBody && (
                <div class="text-xs text-muted truncate">
                  {room.lastMessageSenderName ? `${room.lastMessageSenderName}: ` : ''}{room.lastMessageBody}
                </div>
              )}
            </div>
            <!-- Unread badge -->
            {room.unreadCount > 0 && (
              <span class="flex-shrink-0 bg-blue-500 text-white rounded-full text-xs font-bold px-2 py-0.5 font-mono leading-snug">
                {room.unreadCount}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/portal/NachrichtenSection.astro
git commit -m "feat(portal): add NachrichtenSection with last-message preview"
```

---

## Task 10: Create BesprechungenSection.astro

**Files:**
- Create: `website/src/components/portal/BesprechungenSection.astro`

- [ ] **Step 1: Create the file**

```astro
---
import type { Meeting } from '../../lib/website-db';

interface Props {
  meetings: Meeting[];
}
const { meetings } = Astro.props;

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function meetingLabel(m: Meeting): string {
  const base = m.meetingType
    ? m.meetingType.replace(/-/g, ' ')
    : 'Besprechung';
  const date = m.scheduledAt ?? m.createdAt;
  return `${base} · ${fmtDate(date)}`;
}
---

<div class="pt-10 pb-20 px-8 max-w-2xl">
  <h2 class="text-xl font-bold text-light font-serif mb-6">Besprechungen</h2>

  {meetings.length === 0 ? (
    <p class="text-muted">Keine freigegebenen Besprechungen vorhanden.</p>
  ) : (
    <ul class="flex flex-col gap-3">
      {meetings.map(m => (
        <li class="p-4 bg-dark-light rounded-xl border border-dark-lighter">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-light">{meetingLabel(m)}</div>
              {m.projectName && (
                <div class="text-xs text-muted mt-0.5">Projekt: {m.projectName}</div>
              )}
            </div>
            <span class="text-xs px-2 py-0.5 rounded-full bg-dark border border-dark-lighter text-muted flex-shrink-0 capitalize">
              {m.status}
            </span>
          </div>
          {m.released_at && (
            <div class="mt-3 pt-3 border-t border-dark-lighter">
              <a href={`/portal/besprechung/${m.id}`}
                 class="inline-flex items-center gap-1.5 text-xs text-gold hover:underline">
                Transkript ansehen →
              </a>
            </div>
          )}
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 2: Also create the transcript detail page** `website/src/pages/portal/besprechung/[id].astro`:

```astro
---
import Layout from '../../../layouts/Layout.astro';
import { getSession, getLoginUrl } from '../../../lib/auth';
import { getMeetingDetail } from '../../../lib/website-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());

const { id } = Astro.params;
const meeting = await getMeetingDetail(id!);

// Only allow if meeting belongs to this user and has a transcript
if (!meeting || meeting.customerEmail !== session.email || !meeting.transcript) {
  return Astro.redirect('/portal?section=besprechungen');
}
---

<Layout title="Besprechung">
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-3xl mx-auto px-6">
      <a href="/portal?section=besprechungen" class="text-muted hover:text-gold text-sm">← Zurück</a>
      <h1 class="text-2xl font-bold text-light font-serif mt-4 mb-2">
        {meeting.meetingType.replace(/-/g, ' ')}
      </h1>
      <p class="text-muted text-sm mb-8">
        {meeting.createdAt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
      </p>

      {meeting.transcript ? (
        <div class="bg-dark-light rounded-xl border border-dark-lighter p-6">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-widest mb-4">Transkript</h2>
          <p class="text-light text-sm leading-relaxed whitespace-pre-wrap">{meeting.transcript.fullText}</p>
        </div>
      ) : (
        <p class="text-muted">Kein Transkript verfügbar.</p>
      )}
    </div>
  </section>
</Layout>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/portal/BesprechungenSection.astro website/src/pages/portal/besprechung/[id].astro
git commit -m "feat(portal): add BesprechungenSection and transcript detail page"
```

---

## Task 11: Create DateienSection.astro

**Files:**
- Create: `website/src/components/portal/DateienSection.astro`

- [ ] **Step 1: Create the file**

The `getFileUrl` function in nextcloud-files.ts returns the WebDAV URL (for opening in Nextcloud/Collabora). For download, use the same URL with `Content-Disposition: attachment` — this is handled by linking directly and adding a `download` attribute.

```astro
---
import { listFiles, getClientFolderPath, getFileUrl } from '../../lib/nextcloud-files';
import type { NcFile } from '../../lib/nextcloud-files';

interface Props {
  clientUsername: string;
}
const { clientUsername } = Astro.props;

const clientFolder = getClientFolderPath(clientUsername);
let files: NcFile[] = [];
try {
  files = (await listFiles(clientFolder)).filter(f => f.contentType !== 'httpd/unix-directory');
} catch { /* Nextcloud unavailable */ }

const ncExtUrl = (process.env.NEXTCLOUD_EXTERNAL_URL ?? '').replace(/\/$/, '');

function openInNcUrl(file: NcFile): string {
  // Link to Nextcloud file browser folder view for this client
  return ncExtUrl ? `${ncExtUrl}/apps/files/?dir=/Clients/${clientUsername}` : '#';
}
---

<div class="pt-10 pb-20 px-8 max-w-2xl">
  <h2 class="text-xl font-bold text-light font-serif mb-6">Dateien</h2>

  {files.length === 0 ? (
    <p class="text-muted">Keine Dateien vorhanden.</p>
  ) : (
    <ul class="flex flex-col gap-2">
      {files.map(file => {
        const downloadUrl = getFileUrl(file.path.replace(/^\/remote\.php\/dav\/files\/[^/]+\//, ''));
        return (
          <li class="flex items-center gap-3 p-3 bg-dark-light rounded-xl border border-dark-lighter">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-muted flex-shrink-0" aria-hidden="true">
              <path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5v3h3"/>
            </svg>
            <span class="flex-1 text-sm text-light truncate">{file.name}</span>
            <span class="text-xs text-muted flex-shrink-0">{file.lastModified ? new Date(file.lastModified).toLocaleDateString('de-DE') : ''}</span>
            <div class="flex gap-2 flex-shrink-0">
              <a href={downloadUrl} download={file.name}
                 class="text-xs text-muted hover:text-gold transition-colors px-2 py-1 rounded border border-dark-lighter hover:border-gold/40">
                Laden
              </a>
              <a href={openInNcUrl(file)} target="_blank" rel="noopener noreferrer"
                 class="text-xs text-muted hover:text-gold transition-colors px-2 py-1 rounded border border-dark-lighter hover:border-gold/40">
                Öffnen ↗
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  )}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/portal/DateienSection.astro
git commit -m "feat(portal): add DateienSection with download and open-in-Nextcloud actions"
```

---

## Task 12: Create TermineSection.astro

**Files:**
- Create: `website/src/components/portal/TermineSection.astro`

- [ ] **Step 1: Create the file**

```astro
---
import type { ClientBooking } from '../../lib/caldav';

interface Props {
  bookings: ClientBooking[];
}
const { bookings } = Astro.props;

const now = new Date();
const upcoming = bookings.filter(b => b.start >= now && b.status !== 'CANCELLED');
const past     = bookings.filter(b => b.start < now  || b.status === 'CANCELLED');
---

<div class="pt-10 pb-20 px-8 max-w-2xl">
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-xl font-bold text-light font-serif">Termine</h2>
    <a href="/termin" class="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900 bg-brass px-4 py-2 rounded-full hover:bg-brass-2 transition-colors">
      Neuen Termin buchen
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5" aria-hidden="true">
        <path d="M2 7h10M8 3l4 4-4 4"/>
      </svg>
    </a>
  </div>

  {bookings.length === 0 ? (
    <p class="text-muted">Keine gebuchten Termine vorhanden.</p>
  ) : (
    <>
      {upcoming.length > 0 && (
        <div class="mb-6">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Anstehend</h3>
          <ul class="flex flex-col gap-2">
            {upcoming.map(b => (
              <li class="flex items-center gap-3 p-3 bg-dark-light rounded-xl border border-dark-lighter">
                <div class="flex-1">
                  <div class="text-sm font-medium text-light">{b.summary}</div>
                  <div class="text-xs text-muted mt-0.5">
                    {b.start.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
                    {' · '}
                    {b.start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    {' – '}
                    {b.end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <span class="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">
                  {b.status === 'TENTATIVE' ? 'Anfrage' : 'Bestätigt'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h3 class="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Vergangene</h3>
          <ul class="flex flex-col gap-2">
            {past.map(b => (
              <li class="flex items-center gap-3 p-3 bg-dark-light rounded-xl border border-dark-lighter opacity-50">
                <div class="flex-1">
                  <div class="text-sm text-light">{b.summary}</div>
                  <div class="text-xs text-muted mt-0.5">
                    {b.start.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </div>
                </div>
                <span class="text-xs px-2 py-0.5 rounded-full bg-dark border border-dark-lighter text-muted">
                  {b.status === 'CANCELLED' ? 'Abgesagt' : 'Vergangen'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/portal/TermineSection.astro
git commit -m "feat(portal): add TermineSection with booking CTA"
```

---

## Task 13: Create ProjekteSection.astro

**Files:**
- Create: `website/src/components/portal/ProjekteSection.astro`

- [ ] **Step 1: Create the file**

Task toggling uses `<form method="post">` — same pattern as `OnboardingTab.astro`.

```astro
---
import type { PortalProject } from '../../lib/website-db';

interface Props {
  projects: PortalProject[];
  back: string;
}
const { projects, back } = Astro.props;

function pct(p: PortalProject): number {
  if (!p.tasks.length) return 0;
  return Math.round((p.tasks.filter(t => t.status === 'erledigt').length / p.tasks.length) * 100);
}
---

<div class="pt-10 pb-20 px-8 max-w-2xl">
  <h2 class="text-xl font-bold text-light font-serif mb-6">Projekte</h2>

  {projects.length === 0 ? (
    <p class="text-muted">Keine Projekte vorhanden.</p>
  ) : (
    <div class="flex flex-col gap-6">
      {projects.map(p => {
        const progress = pct(p);
        return (
          <div class="bg-dark-light rounded-xl border border-dark-lighter p-5">
            <div class="flex items-start justify-between mb-2">
              <div>
                <div class="text-sm font-semibold text-light">{p.name}</div>
                {p.description && <div class="text-xs text-muted mt-0.5">{p.description}</div>}
              </div>
              <span class="text-xs px-2 py-0.5 rounded-full bg-dark border border-dark-lighter text-muted capitalize flex-shrink-0 ml-2">{p.status}</span>
            </div>

            <!-- Progress bar -->
            <div class="w-full bg-dark rounded-full h-1.5 mb-4 overflow-hidden">
              <div class={`h-full rounded-full ${progress === 100 ? 'bg-green-500' : 'bg-gold'}`} style={`width:${progress}%`}></div>
            </div>

            {p.tasks.length > 0 && (
              <ul class="flex flex-col gap-1.5">
                {p.tasks.map(task => (
                  <li class="flex items-center gap-3">
                    {task.isUserTask ? (
                      <form method="post" action={`/api/portal/projekttasks/${task.id}/done`} class="contents">
                        <input type="hidden" name="_back" value={back} />
                        <button type="submit"
                          class={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer
                            ${task.status === 'erledigt'
                              ? 'border-green-500 bg-green-500/20 text-green-400 hover:bg-green-500/30'
                              : 'border-gold/60 text-transparent hover:border-gold'}`}>
                          {task.status === 'erledigt' ? '✓' : ''}
                        </button>
                      </form>
                    ) : (
                      <div class={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                        ${task.status === 'erledigt' ? 'border-dark-lighter bg-dark-lighter text-muted' : 'border-dark-lighter text-transparent'}`}>
                        {task.status === 'erledigt' ? '✓' : ''}
                      </div>
                    )}
                    <span class={`text-sm ${task.status === 'erledigt' ? 'text-muted line-through' : task.isUserTask ? 'text-light' : 'text-fg-soft'}`}>
                      {task.name}
                      {!task.isUserTask && <span class="ml-1 text-xs text-muted">(Admin)</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  )}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/portal/ProjekteSection.astro
git commit -m "feat(portal): add ProjekteSection with interactive user task checkboxes"
```

---

## Task 14: Create RechnungenSection.astro

**Files:**
- Create: `website/src/components/portal/RechnungenSection.astro`

- [ ] **Step 1: Create the file**

Wraps `InvoicesTab` content directly — reusing the query logic but without the `CreateInvoiceModal`.

```astro
---
import { getCustomerInvoices } from '../../lib/stripe-billing';
import type { BillingInvoice } from '../../lib/stripe-billing';

interface Props {
  clientEmail: string;
}
const { clientEmail } = Astro.props;

let invoices: BillingInvoice[] = [];
try { invoices = await getCustomerInvoices(clientEmail); } catch { /* Stripe unavailable */ }

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}
function fmtDate(s: string) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function statusColor(s: string) {
  if (s === 'paid')          return 'bg-green-500/20 text-green-400';
  if (s === 'open')          return 'bg-accent/20 text-accent';
  if (s === 'uncollectible') return 'bg-red-500/20 text-red-400';
  return 'bg-dark-lighter text-muted';
}
---

<div class="pt-10 pb-20 px-8 max-w-2xl">
  <h2 class="text-xl font-bold text-light font-serif mb-6">Rechnungen</h2>

  {invoices.length === 0 ? (
    <p class="text-muted">Keine Rechnungen vorhanden.</p>
  ) : (
    <ul class="flex flex-col gap-2">
      {invoices.map(inv => (
        <li class="flex items-center gap-3 p-3 bg-dark-light rounded-xl border border-dark-lighter" data-testid="invoice-item">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-light">#{inv.number}</span>
              <span class={`text-xs px-2 py-0.5 rounded-full ${statusColor(inv.status)}`}>{inv.statusLabel}</span>
            </div>
            <div class="text-xs text-muted mt-0.5">
              {fmtDate(inv.date)}
              {inv.dueDate && inv.status !== 'paid' && <span> · Fällig: {fmtDate(inv.dueDate)}</span>}
            </div>
          </div>
          <div class="text-right flex-shrink-0">
            <div class="text-sm font-medium text-light">{fmtCurrency(inv.amountDue)}</div>
            {inv.hostedUrl && inv.status !== 'paid' && (
              <a href={inv.hostedUrl} target="_blank" rel="noopener" class="text-xs text-blue-400 hover:underline mt-0.5 block">
                Jetzt zahlen ↗
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/portal/RechnungenSection.astro
git commit -m "feat(portal): add RechnungenSection without admin invoice modal"
```

---

## Task 15: Create DiensteSection.astro and KontoSection.astro

**Files:**
- Create: `website/src/components/portal/DiensteSection.astro`
- Create: `website/src/components/portal/KontoSection.astro`

- [ ] **Step 1: Create DiensteSection.astro**

```astro
---
interface Props {
  ncBase: string;
  wikiUrl: string;
  vaultUrl: string;
  keycloakBase: string;
}
const { ncBase, wikiUrl, vaultUrl, keycloakBase } = Astro.props;

const services = [
  ...(ncBase ? [
    { href: `${ncBase}/apps/files/`,      label: 'Dateien',    desc: 'Ihre Dokumente und Uploads', icon: '📁' },
    { href: `${ncBase}/apps/calendar/`,   label: 'Kalender',   desc: 'Termine und Ereignisse',     icon: '📅' },
    { href: `${ncBase}/apps/contacts/`,   label: 'Kontakte',   desc: 'Adressbuch',                 icon: '👥' },
    { href: `${ncBase}/apps/spreed/`,     label: 'Talk',       desc: 'Video & Gruppen-Chat',       icon: '🎥' },
    { href: `${ncBase}/apps/whiteboard/`, label: 'Whiteboard', desc: 'Gemeinsames Zeichenbrett',   icon: '🖊️' },
  ] : []),
  ...(wikiUrl  ? [{ href: wikiUrl,  label: 'Wiki',        desc: 'Dokumentation & Wissen', icon: '📚' }] : []),
  ...(vaultUrl ? [{ href: vaultUrl, label: 'Passwörter',  desc: 'Vaultwarden Safe',       icon: '🔒' }] : []),
];
---

<div class="pt-10 pb-20 px-8 max-w-3xl">
  <h2 class="text-xl font-bold text-light font-serif mb-6">Alle Dienste</h2>

  {services.length === 0 ? (
    <p class="text-muted">Keine externen Dienste konfiguriert.</p>
  ) : (
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {services.map(s => (
        <a href={s.href} target="_blank" rel="noopener noreferrer"
           class="flex items-start gap-3 p-4 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors">
          <span class="text-2xl leading-none flex-shrink-0 mt-0.5">{s.icon}</span>
          <div>
            <div class="text-sm font-semibold text-light">{s.label}</div>
            <div class="text-xs text-muted mt-0.5">{s.desc}</div>
          </div>
        </a>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 2: Create KontoSection.astro**

```astro
---
import type { UserSession } from '../../lib/auth';

interface Props {
  session: UserSession;
  keycloakBase: string;
  realm: string;
}
const { session, keycloakBase, realm } = Astro.props;
const kcAccountUrl = `${keycloakBase}/realms/${realm}/account/`;
---

<div class="pt-10 pb-20 px-8 max-w-xl">
  <h2 class="text-xl font-bold text-light font-serif mb-6">Konto</h2>

  <div class="flex flex-col gap-3">
    <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter mb-2">
      <div class="text-sm font-semibold text-light">{session.name}</div>
      <div class="text-xs text-muted font-mono mt-0.5">{session.email}</div>
    </div>

    <a href={kcAccountUrl} target="_blank" rel="noopener noreferrer"
       class="flex items-center gap-3 p-4 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-muted flex-shrink-0" aria-hidden="true">
        <circle cx="8" cy="5" r="3"/><path d="M2.5 14.5a5.5 5.5 0 0 1 11 0"/>
      </svg>
      <div>
        <div class="text-sm font-medium text-light">Konto verwalten</div>
        <div class="text-xs text-muted">Passwort, E-Mail, Zwei-Faktor-Auth</div>
      </div>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="w-3.5 h-3.5 text-muted ml-auto" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>
    </a>

    <a href="/meine-daten"
       class="flex items-center gap-3 p-4 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-muted flex-shrink-0" aria-hidden="true">
        <rect x="2" y="3.5" width="12" height="10" rx="1"/><path d="M2 10h3.5l1.5 2 1.5-2H12"/>
      </svg>
      <div>
        <div class="text-sm font-medium text-light">Meine Daten (DSGVO)</div>
        <div class="text-xs text-muted">Datenschutz, Datenauskunft, Löschung</div>
      </div>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="w-3.5 h-3.5 text-muted ml-auto" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>
    </a>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/portal/DiensteSection.astro website/src/components/portal/KontoSection.astro
git commit -m "feat(portal): add DiensteSection and KontoSection"
```

---

## Task 16: Rewrite portal.astro

**Files:**
- Modify: `website/src/pages/portal.astro`

This is the main assembly step. It fetches all badge/stat data, routes to the right section, and renders `PortalLayout` with the active section component inside.

- [ ] **Step 1: Replace portal.astro entirely**

```astro
---
import PortalLayout from '../layouts/PortalLayout.astro';
import { getSession, getLoginUrl } from '../lib/auth';
import { getCustomerByEmail, listRoomsWithInboxData } from '../lib/messaging-db';
import { getMeetingsForClient, listProjectsForCustomer, getOrCreateOnboardingChecklist } from '../lib/website-db';
import { getClientBookings } from '../lib/caldav';
import { getCustomerInvoices } from '../lib/stripe-billing';
import { listFiles, getClientFolderPath, PENDING_SIGNATURES_DIR } from '../lib/nextcloud-files';

import OverviewSection     from '../components/portal/OverviewSection.astro';
import NachrichtenSection  from '../components/portal/NachrichtenSection.astro';
import BesprechungenSection from '../components/portal/BesprechungenSection.astro';
import DateienSection      from '../components/portal/DateienSection.astro';
import TermineSection      from '../components/portal/TermineSection.astro';
import ProjekteSection     from '../components/portal/ProjekteSection.astro';
import RechnungenSection   from '../components/portal/RechnungenSection.astro';
import SignaturesTab       from '../components/portal/SignaturesTab.astro';
import OnboardingTab       from '../components/portal/OnboardingTab.astro';
import DiensteSection      from '../components/portal/DiensteSection.astro';
import KontoSection        from '../components/portal/KontoSection.astro';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());

const section = Astro.url.searchParams.get('section') ?? 'overview';
const username = session.preferred_username ?? session.sub;

const ncBase      = (process.env.NEXTCLOUD_EXTERNAL_URL ?? '').replace(/\/$/, '');
const wikiUrl     = process.env.WIKI_EXTERNAL_URL ?? '';
const vaultUrl    = process.env.VAULT_EXTERNAL_URL ?? '';
const keycloakBase = process.env.KEYCLOAK_FRONTEND_URL ?? '';
const realm        = process.env.KEYCLOAK_REALM ?? 'workspace';

// ── Badge counts (always needed for sidebar) ─────────────────────
let unreadMessages    = 0;
let pendingSignatures = 0;

const customer = await getCustomerByEmail(session.email).catch(() => null);
if (customer) {
  const rooms = await listRoomsWithInboxData(customer.id).catch(() => []);
  unreadMessages = rooms.reduce((s, r) => s + r.unreadCount, 0);
}

try {
  const clientFolder = getClientFolderPath(username);
  const pendingFiles = await listFiles(`${clientFolder}${PENDING_SIGNATURES_DIR}/`);
  pendingSignatures = pendingFiles.filter(f => f.contentType !== 'httpd/unix-directory').length;
} catch { /* Nextcloud unavailable */ }

// ── Section data (lazy — only what the active section needs) ─────

// Overview needs bookings + invoices + onboarding %
let nextBooking = null;
let openInvoices = 0;
let onboardingPct = 0;

if (section === 'overview') {
  const [bookings, invoices, onboarding] = await Promise.allSettled([
    getClientBookings(session.email),
    getCustomerInvoices(session.email),
    getOrCreateOnboardingChecklist(session.sub),
  ]);
  if (bookings.status === 'fulfilled') {
    const upcoming = bookings.value.filter(b => b.start >= new Date() && b.status !== 'CANCELLED');
    nextBooking = upcoming[0] ?? null;
  }
  if (invoices.status === 'fulfilled') {
    openInvoices = invoices.value.filter(i => i.amountRemaining > 0 && !['void','uncollectible'].includes(i.status)).length;
  }
  if (onboarding.status === 'fulfilled' && onboarding.value.length) {
    onboardingPct = Math.round((onboarding.value.filter(i => i.done).length / onboarding.value.length) * 100);
  }
}

// Nachrichten
const rooms = (section === 'nachrichten' && customer)
  ? await listRoomsWithInboxData(customer.id).catch(() => [])
  : [];

// Besprechungen
const meetings = section === 'besprechungen'
  ? await getMeetingsForClient(session.email, true).catch(() => [])
  : [];

// Dateien / Unterschriften use their own fetch inside the components

// Projekte
const projects = section === 'projekte'
  ? await listProjectsForCustomer(session.sub).catch(() => [])
  : [];

// Termine / Rechnungen / Onboarding use their own fetch inside the components
---

<PortalLayout
  title="Mein Portal"
  {section}
  {session}
  {unreadMessages}
  {pendingSignatures}
>
  {section === 'overview'      && <OverviewSection {session} {nextBooking} {openInvoices} {unreadMessages} {onboardingPct} {ncBase} {wikiUrl} {vaultUrl} />}
  {section === 'nachrichten'   && <NachrichtenSection {rooms} />}
  {section === 'besprechungen' && <BesprechungenSection {meetings} />}
  {section === 'dateien'       && <DateienSection clientUsername={username} />}
  {section === 'unterschriften'&& <div class="pt-10 pb-20 px-8 max-w-2xl"><h2 class="text-xl font-bold text-light font-serif mb-6">Unterschriften</h2><SignaturesTab clientUsername={username} /></div>}
  {section === 'termine'       && <TermineSection bookings={[]} />}
  {section === 'rechnungen'    && <RechnungenSection clientEmail={session.email} />}
  {section === 'projekte'      && <ProjekteSection {projects} back={Astro.url.href} />}
  {section === 'onboarding'    && <div class="pt-10 pb-20 px-8 max-w-xl"><h2 class="text-xl font-bold text-light font-serif mb-6">Onboarding</h2><OnboardingTab keycloakUserId={session.sub} back={Astro.url.href} /></div>}
  {section === 'dienste'       && <DiensteSection {ncBase} {wikiUrl} {vaultUrl} {keycloakBase} />}
  {section === 'konto'         && <KontoSection {session} {keycloakBase} {realm} />}
</PortalLayout>
```

**Note:** The `TermineSection` line passes `bookings={[]}` as a placeholder — fix it in Step 2.

- [ ] **Step 2: Fix the Termine section — fetch bookings when needed**

In `portal.astro`, add before the `<PortalLayout>` tag:

```typescript
const bookings = section === 'termine'
  ? await getClientBookings(session.email).catch(() => [])
  : [];
```

And update the Termine line to:

```astro
{section === 'termine' && <TermineSection {bookings} />}
```

- [ ] **Step 3: Type-check the full website**

```bash
cd website && npx tsc --noEmit 2>&1
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 4: Deploy to dev cluster and smoke test**

```bash
task website:deploy
```

Open http://web.localhost and log in. Verify:
- Sidebar renders with all groups
- Übersicht loads (stat cards visible even if values are 0/—)
- Nachrichten section shows room list (or "Keine" message)
- Termine section shows "Neuen Termin buchen" button
- Projekte section shows "Keine Projekte" or actual projects
- Dienste section shows service cards
- Konto section shows two links
- Unterschriften section renders (reuses existing component)
- Onboarding section renders checklist

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/portal.astro
git commit -m "feat(portal): rewrite portal.astro with sidebar layout and section routing"
```

---

## Task 17: Final integration check and deploy

- [ ] **Step 1: Check TypeScript across all modified files**

```bash
cd website && npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 2: Verify admin "Als Nutzer ansehen" link still works**

Log in as admin, open the user dropdown in the navigation, click "Als Nutzer ansehen". Verify it loads `/portal` and shows the new sidebar layout.

- [ ] **Step 3: Deploy**

```bash
task website:deploy
```

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git add -p
git commit -m "feat(portal): user integration — sidebar layout with all service sections"
```
