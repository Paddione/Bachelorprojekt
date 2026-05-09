---
title: Unified Ticketing PR4/5 — `/admin/tickets` UI + admin API
domains: [website, db]
status: active
pr_number: null
---

# Unified Ticketing PR4/5 — `/admin/tickets` UI + admin API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified `/admin/tickets` index + detail UI (cross-type inbox + activity-driven detail page) and the admin API endpoints behind it (`/api/admin/tickets/*`), all reading and writing the existing `tickets.tickets` schema. Brand-scoped, every transition routed through the existing `transitionTicket()` helper, every action surfaced through one shared activity timeline.

**Architecture:** PR1/2/3 created the `tickets` schema and migrated bugs, features, requirements, projects, sub-projects, tasks, attachments, and the PR ledger into it. The TypeScript helpers in `website/src/lib/website-db.ts` already speak `tickets.*` for the bugs/projekte pages, and `transitionTicket()` is the single writer for status changes. PR4 is **purely additive UI + API**: a new `/admin/tickets` index page (Linear-style filterable inbox with saved-view chips) and a new `/admin/tickets/:id` detail page (header, activity timeline, child tree, sidebar metadata, action bar). The existing `/admin/bugs.astro` and `/admin/projekte.astro` are untouched — they keep their current visual UX per the PR-kickoff hard-constraint #5. New helpers live in `website/src/lib/tickets/admin.ts`. Brand multi-tenancy is enforced everywhere by filtering `tickets.tickets.brand = $brand` (where `$brand = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder'`). The activity timeline is a single Svelte component that merges `tickets.ticket_activity` + `ticket_comments` + `ticket_links` (with PR ledger join) and renders one chronological feed used by both the detail page and any future portal page.

**Tech Stack:** Astro 4 SSR pages + Svelte 4 islands, TypeScript on the helpers, the existing `pg` pool from `website-db.ts`, Mailpit + Playwright for e2e. Mirrors the visual language of `admin/bugs.astro` (dark theme, gold accents, Tailwind classes like `bg-dark-light`, `border-dark-lighter`, `text-gold`) and the editor patterns of `admin/projekte/[id].astro` (HTML `<dialog>` for modals, hidden `_back` form inputs for redirects, `progressively-enhanced GET forms` for filters).

---

## Why this is bite-sized

PR4 touches **no DB schema** and **no migration script**. It is:
- One new TS helper file (`tickets/admin.ts`)
- Seven new API endpoints (one Astro file each)
- Two new Svelte islands
- Two new Astro pages
- One nav-link change in `AdminLayout.astro`
- One docs-site mention
- One new Playwright spec

It does **not** touch:
- `tickets/transition.ts`, `tickets/email-templates.ts`, `tickets/reporter-link.ts` (PR1 — single writer stays single writer)
- `tickets-db.ts` (PR1/3 — schema init is complete)
- `bugs.astro`, `projekte.astro`, `projekte/[id].astro` (per kickoff hard-constraint #5)
- Inbox UI or `/api/admin/inbox/[id]/action.ts` (already routes bug resolves through `transitionTicket()` via `resolveBugTicket()`; no change needed in PR4)
- `scripts/track-pr.mjs` (PR1 — already issues `transitionTicket()` calls)
- Sealed secrets, prod overlays, k3d manifests, ArgoCD apps

Hard constraints carried into every task:

1. **Brand multi-tenancy.** Every list query filters by `t.brand = $brand`. Every detail/mutation looks up the ticket and verifies `ticket.brand === $brand` before returning data or persisting. `$brand` for SSR/API: `process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder'` (matches `bugs.astro:16`, `projekte.astro:11`, and the website ConfigMap `k3d/website.yaml`).
2. **Single writer for status changes.** Every status mutation (resolve, archive, reopen, custom transition) goes through `transitionTicket()` from `website/src/lib/tickets/transition.ts`. The new `/api/admin/tickets/:id/transition` endpoint is a thin wrapper. The new `/api/admin/tickets/:id` PATCH endpoint must **reject** any payload that includes `status` — clients use `/transition` for that.
3. **Audit log is read-only from PR4.** PR1's PL/pgSQL trigger `tickets.fn_audit_log` writes `ticket_activity` rows on every UPDATE. PR4 only reads them. The activity timeline merges `ticket_activity` + `ticket_comments` + `ticket_links` (typed) + `pr_events` (joined via `ticket_links.pr_number`).
4. **No new DB columns.** If the spec calls for it but the column doesn't exist (e.g. ticket-watcher email subscription on/off), defer to PR5 or a follow-up. Helpers must work with what PR1/3 created.
5. **`session.preferred_username` is the actor label.** Don't try to map Keycloak `sub` to `customers.id` in PR4 — every existing transition caller (`resolveBugTicket`, `archiveBugTicket`, `reopenBugTicket`, the inbox `resolve_bug` action) passes `{ label: session.preferred_username }` only. Match that pattern. The audit log's `actor_id` will stay NULL for now; `actor_label` is enough for v1.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `website/src/lib/tickets/admin.ts` | Create | All brand-scoped admin reads/writes: `listAdminTickets`, `getTicketDetail`, `addComment`, `addLink`, `removeLink`, `addAttachment`, plus `TicketDetail`/`TimelineEntry`/`ListedTicket` types. The single source of truth for ticket data shape across the new pages and APIs. |
| `website/src/pages/api/admin/tickets/index.ts` | Create | `GET` (list with filters + pagination + brand scope) and `POST` (create new ticket, auto-mint `external_id` for non-bug types). |
| `website/src/pages/api/admin/tickets/[id].ts` | Create | `GET` (full detail), `PATCH` (partial update — explicitly rejects `status`, `resolution`). |
| `website/src/pages/api/admin/tickets/[id]/transition.ts` | Create | `POST` — wraps `transitionTicket()` with brand-guard + actor-label. |
| `website/src/pages/api/admin/tickets/[id]/comments.ts` | Create | `POST` — adds comment; if `visibility='public'` and ticket has `reporter_email`, sends a public-comment email (uses existing `email.ts`). |
| `website/src/pages/api/admin/tickets/[id]/links.ts` | Create | `POST` (add typed link), `DELETE` (remove link by `id`). |
| `website/src/pages/api/admin/tickets/[id]/attachments.ts` | Create | `POST` — multipart upload, stores `data_url` (Nextcloud upload deferred to v1.5 per spec). |
| `website/src/components/admin/TicketActivityTimeline.svelte` | Create | Renders the unified timeline: status changes, field edits, comments, link adds, attachment adds, PR-merge events. |
| `website/src/components/admin/TicketActionBar.svelte` | Create | Header action row: Transition (status select + resolution + note), Add comment (visibility toggle), Add link (kind + target search), Add watcher (admin select). All POST to the API. |
| `website/src/pages/admin/tickets.astro` | Create | Index page: filter chips (type, status, brand-self, assignee, customer), search, saved-view chips ("My open", "Triage queue", "In review", "Customer X", "Thesis FA"), sortable table. |
| `website/src/pages/admin/tickets/[id].astro` | Create | Detail page: header, sidebar metadata, child tree, linked tickets (in + out), description editor, action bar, activity timeline, attachments. |
| `website/src/layouts/AdminLayout.astro` | Modify | Add `{ href: '/admin/tickets', label: 'Tickets', icon: 'tag' }` under the "Betrieb" group, between Projekte and Rechnungen. |
| `docs-site/index.html` | Modify | Add a `## Tickets` paragraph under the existing admin section pointing at `/admin/tickets` for the unified inbox. |
| `tests/e2e/specs/fa-admin-tickets.spec.ts` | Create | Filter, transition (with reporter close-mail check via Mailpit), comment add (public + internal), link create. Brand-isolation guard via prod URL check. |

**No file is created in** `prod*/`, `k3d/`, `argocd/`, or `scripts/` — there is no infrastructure work.

---

## Task 1: Create `website/src/lib/tickets/admin.ts`

**Why:** All admin reads/writes need brand scoping. Putting the SQL in one file keeps the API endpoints thin and the brand filter consistent. The same helpers can be reused by the (future) portal ticket views.

**Files:**
- Create: `website/src/lib/tickets/admin.ts`

- [ ] **Step 1: Read `website/src/lib/website-db.ts:1100-1170, 2804-2865` to confirm helper conventions.**

`pool` is exported from `website-db.ts`. The status-mapping pattern (`STATUS_BACK_SQL`, `mapStatusFwd`) lives there too — for PR4 we use the `tickets`-native enum directly (no back-mapping) because the new UI shows the new status names verbatim. Helpers in this file MUST `await initTicketsSchema()` at the top so the schema is guaranteed to exist (matches how `listProjects()` does it).

- [ ] **Step 2: Write `website/src/lib/tickets/admin.ts` with the full helper set.**

```ts
// website/src/lib/tickets/admin.ts
//
// Brand-scoped admin helpers for the unified /admin/tickets UI.
// Every function takes `brand` as a required parameter and refuses to read
// or write a ticket whose `brand` doesn't match.
//
// Status changes go through transitionTicket() (lib/tickets/transition.ts) —
// these helpers do NOT mutate `status` or `resolution`.

import { pool, type Customer } from '../website-db';
import { initTicketsSchema } from '../tickets-db';

// ── Types ───────────────────────────────────────────────────────────────────

export type TicketType = 'bug' | 'feature' | 'task' | 'project';
export type TicketStatus =
  'triage' | 'backlog' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'archived';
export type TicketResolution =
  'fixed' | 'shipped' | 'wontfix' | 'duplicate' | 'cant_reproduce' | 'obsolete';
export type TicketPriority = 'hoch' | 'mittel' | 'niedrig';
export type TicketSeverity = 'critical' | 'major' | 'minor' | 'trivial';
export type LinkKind =
  'blocks' | 'blocked_by' | 'duplicate_of' | 'relates_to' | 'fixes' | 'fixed_by';

export interface ListedTicket {
  id: string;
  externalId: string | null;
  type: TicketType;
  brand: string;
  title: string;
  status: TicketStatus;
  resolution: TicketResolution | null;
  priority: TicketPriority;
  severity: TicketSeverity | null;
  component: string | null;
  thesisTag: string | null;
  parentId: string | null;
  assigneeId: string | null;
  assigneeLabel: string | null;
  customerId: string | null;
  customerLabel: string | null;
  reporterEmail: string | null;
  dueDate: Date | null;
  childCount: number;
  tagNames: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketDetail extends ListedTicket {
  description: string | null;
  notes: string | null;
  url: string | null;
  startDate: Date | null;
  estimateMinutes: number | null;
  timeLoggedMinutes: number;
  triagedAt: Date | null;
  startedAt: Date | null;
  doneAt: Date | null;
  archivedAt: Date | null;
  reporterId: string | null;
  watchers: { id: string; label: string }[];
  children: ListedTicket[];
  links: TicketLinkRow[];
  attachments: TicketAttachmentRow[];
}

export interface TicketLinkRow {
  id: number;
  kind: LinkKind;
  direction: 'out' | 'in';        // 'out' = from this ticket; 'in' = to this ticket
  otherId: string;
  otherExternalId: string | null;
  otherTitle: string;
  otherType: TicketType;
  otherStatus: TicketStatus;
  prNumber: number | null;
  prTitle: string | null;          // joined from tickets.pr_events when prNumber is set
  prMergedAt: Date | null;
  createdAt: Date;
}

export interface TicketAttachmentRow {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number | null;
  ncPath: string | null;
  hasDataUrl: boolean;             // we never ship the full data_url in list responses
  uploadedAt: Date;
}

export type TimelineEntry =
  | { kind: 'created';    at: Date; actor: string | null; ticketId: string }
  | { kind: 'updated';    at: Date; actor: string | null; ticketId: string;
      diff: Record<string, { old: unknown; new: unknown }> }
  | { kind: 'comment';    at: Date; actor: string | null; ticketId: string;
      body: string; visibility: 'internal' | 'public'; commentKind: string }
  | { kind: 'link_added'; at: Date; actor: string | null; ticketId: string;
      linkKind: LinkKind; otherId: string; otherTitle: string; prNumber: number | null }
  | { kind: 'pr_merged';  at: Date; actor: string | null; ticketId: string;
      prNumber: number; prTitle: string; mergedBy: string | null };

export interface ListFilters {
  brand: string;
  type?: TicketType;
  status?: TicketStatus | 'open';   // 'open' = NOT IN ('done','archived')
  component?: string;
  assigneeId?: string;
  customerId?: string;
  thesisTag?: string;
  tagName?: string;
  q?: string;                        // free-text over title + external_id + reporter_email
  parentIsNull?: boolean;            // for the index, hide child tickets by default
  limit?: number;
  offset?: number;
}

// ── List ────────────────────────────────────────────────────────────────────

const LIST_SELECT = `
  SELECT
    t.id, t.external_id AS "externalId", t.type, t.brand, t.title,
    t.status, t.resolution, t.priority, t.severity, t.component,
    t.thesis_tag AS "thesisTag", t.parent_id AS "parentId",
    t.assignee_id AS "assigneeId",
    a.name AS "assigneeLabel",
    t.customer_id AS "customerId",
    c.name AS "customerLabel",
    t.reporter_email AS "reporterEmail",
    t.due_date AS "dueDate",
    (SELECT COUNT(*)::int FROM tickets.tickets ch WHERE ch.parent_id = t.id) AS "childCount",
    COALESCE(
      (SELECT array_agg(g.name ORDER BY g.name)
         FROM tickets.ticket_tags tt JOIN tickets.tags g ON g.id = tt.tag_id
        WHERE tt.ticket_id = t.id), ARRAY[]::text[]
    ) AS "tagNames",
    t.created_at AS "createdAt", t.updated_at AS "updatedAt"
  FROM tickets.tickets t
  LEFT JOIN customers c ON c.id = t.customer_id
  LEFT JOIN customers a ON a.id = t.assignee_id
`;

const LIST_ORDER = `
  ORDER BY
    CASE t.status
      WHEN 'triage'      THEN 0
      WHEN 'in_progress' THEN 1
      WHEN 'in_review'   THEN 2
      WHEN 'blocked'     THEN 3
      WHEN 'backlog'     THEN 4
      WHEN 'done'        THEN 5
      WHEN 'archived'    THEN 6
      ELSE 7
    END,
    CASE t.priority WHEN 'hoch' THEN 0 WHEN 'mittel' THEN 1 ELSE 2 END,
    t.due_date ASC NULLS LAST,
    t.created_at DESC
`;

export async function listAdminTickets(f: ListFilters): Promise<ListedTicket[]> {
  await initTicketsSchema();
  const where: string[] = ['t.brand = $1'];
  const vals: unknown[] = [f.brand];
  const push = (clause: string, v: unknown) => { vals.push(v); where.push(clause.replace('$N', `$${vals.length}`)); };

  if (f.type) push('t.type = $N', f.type);
  if (f.status === 'open') {
    where.push(`t.status NOT IN ('done','archived')`);
  } else if (f.status) {
    push('t.status = $N', f.status);
  }
  if (f.component)  push('t.component = $N', f.component);
  if (f.assigneeId) push('t.assignee_id = $N::uuid', f.assigneeId);
  if (f.customerId) push('t.customer_id = $N::uuid', f.customerId);
  if (f.thesisTag)  push('t.thesis_tag = $N', f.thesisTag);
  if (f.tagName) {
    push(`EXISTS (SELECT 1 FROM tickets.ticket_tags tt
                    JOIN tickets.tags g ON g.id = tt.tag_id
                   WHERE tt.ticket_id = t.id AND g.name = $N)`, f.tagName);
  }
  if (f.q) {
    push(`(t.title ILIKE '%' || $N || '%'
            OR t.external_id ILIKE '%' || $N || '%'
            OR COALESCE(t.reporter_email,'') ILIKE '%' || $N || '%')`, f.q);
  }
  if (f.parentIsNull) where.push('t.parent_id IS NULL');

  const limit  = Math.min(Math.max(f.limit  ?? 100, 1), 500);
  const offset = Math.max(f.offset ?? 0, 0);

  const sql = `${LIST_SELECT} WHERE ${where.join(' AND ')} ${LIST_ORDER} LIMIT ${limit} OFFSET ${offset}`;
  const r = await pool.query<ListedTicket>(sql, vals);
  return r.rows;
}

export async function countAdminTickets(f: ListFilters): Promise<number> {
  await initTicketsSchema();
  const where: string[] = ['t.brand = $1'];
  const vals: unknown[] = [f.brand];
  const push = (clause: string, v: unknown) => { vals.push(v); where.push(clause.replace('$N', `$${vals.length}`)); };
  if (f.type)        push('t.type = $N', f.type);
  if (f.status === 'open') where.push(`t.status NOT IN ('done','archived')`);
  else if (f.status) push('t.status = $N', f.status);
  if (f.component)   push('t.component = $N', f.component);
  if (f.assigneeId)  push('t.assignee_id = $N::uuid', f.assigneeId);
  if (f.customerId)  push('t.customer_id = $N::uuid', f.customerId);
  if (f.thesisTag)   push('t.thesis_tag = $N', f.thesisTag);
  if (f.tagName) push(
    `EXISTS (SELECT 1 FROM tickets.ticket_tags tt
              JOIN tickets.tags g ON g.id = tt.tag_id
             WHERE tt.ticket_id = t.id AND g.name = $N)`, f.tagName);
  if (f.q) push(
    `(t.title ILIKE '%' || $N || '%'
       OR t.external_id ILIKE '%' || $N || '%'
       OR COALESCE(t.reporter_email,'') ILIKE '%' || $N || '%')`, f.q);
  if (f.parentIsNull) where.push('t.parent_id IS NULL');

  const r = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM tickets.tickets t WHERE ${where.join(' AND ')}`, vals);
  return Number(r.rows[0]?.count ?? 0);
}

// ── Detail ──────────────────────────────────────────────────────────────────

export async function getTicketDetail(brand: string, id: string): Promise<TicketDetail | null> {
  await initTicketsSchema();

  // Brand-scoped fetch — returns null if the ticket exists in a different brand.
  const t = await pool.query<TicketDetail>(
    `${LIST_SELECT}
     , t.description, t.notes, t.url, t.start_date AS "startDate",
       t.estimate_minutes AS "estimateMinutes", t.time_logged_minutes AS "timeLoggedMinutes",
       t.triaged_at AS "triagedAt", t.started_at AS "startedAt",
       t.done_at AS "doneAt", t.archived_at AS "archivedAt",
       t.reporter_id AS "reporterId"
     WHERE t.id = $1 AND t.brand = $2`,
    [id, brand]
  );
  if (t.rows.length === 0) return null;
  const row = t.rows[0];

  const [children, links, attachments, watchers] = await Promise.all([
    pool.query<ListedTicket>(`${LIST_SELECT} WHERE t.parent_id = $1 AND t.brand = $2 ${LIST_ORDER}`, [id, brand]),
    pool.query<TicketLinkRow>(
      `SELECT l.id, l.kind, 'out'::text AS direction, l.to_id AS "otherId",
              ot.external_id AS "otherExternalId", ot.title AS "otherTitle",
              ot.type AS "otherType", ot.status AS "otherStatus",
              l.pr_number AS "prNumber",
              pe.title AS "prTitle", pe.merged_at AS "prMergedAt",
              l.created_at AS "createdAt"
         FROM tickets.ticket_links l
         JOIN tickets.tickets ot ON ot.id = l.to_id
         LEFT JOIN tickets.pr_events pe ON pe.pr_number = l.pr_number
        WHERE l.from_id = $1
       UNION ALL
       SELECT l.id, l.kind, 'in'::text AS direction, l.from_id AS "otherId",
              ot.external_id AS "otherExternalId", ot.title AS "otherTitle",
              ot.type AS "otherType", ot.status AS "otherStatus",
              l.pr_number AS "prNumber",
              pe.title AS "prTitle", pe.merged_at AS "prMergedAt",
              l.created_at AS "createdAt"
         FROM tickets.ticket_links l
         JOIN tickets.tickets ot ON ot.id = l.from_id
         LEFT JOIN tickets.pr_events pe ON pe.pr_number = l.pr_number
        WHERE l.to_id = $1
        ORDER BY "createdAt" DESC`,
      [id]
    ),
    pool.query<TicketAttachmentRow>(
      `SELECT id, filename, mime_type AS "mimeType", file_size AS "fileSize",
              nc_path AS "ncPath", (data_url IS NOT NULL) AS "hasDataUrl",
              uploaded_at AS "uploadedAt"
         FROM tickets.ticket_attachments
        WHERE ticket_id = $1
        ORDER BY uploaded_at DESC`, [id]),
    pool.query<{ id: string; label: string }>(
      `SELECT c.id, c.name AS label
         FROM tickets.ticket_watchers w
         JOIN customers c ON c.id = w.user_id
        WHERE w.ticket_id = $1
        ORDER BY w.added_at`, [id]),
  ]);

  return {
    ...row,
    children:    children.rows,
    links:       links.rows,
    attachments: attachments.rows,
    watchers:    watchers.rows,
  };
}

// ── Activity timeline (merged view: activity + comments + links + PR events)

export async function getTicketTimeline(brand: string, id: string): Promise<TimelineEntry[]> {
  await initTicketsSchema();
  // Brand-guard: refuse to return rows if the ticket belongs to a different brand.
  const guard = await pool.query<{ brand: string }>(
    `SELECT brand FROM tickets.tickets WHERE id = $1`, [id]);
  if (guard.rows.length === 0 || guard.rows[0].brand !== brand) return [];

  const [activity, comments, links] = await Promise.all([
    pool.query<{
      field: string; old_value: unknown; new_value: unknown;
      actor_label: string | null; created_at: Date;
    }>(
      `SELECT field, old_value, new_value, actor_label, created_at
         FROM tickets.ticket_activity WHERE ticket_id = $1`, [id]),
    pool.query<{
      author_label: string; kind: string; body: string;
      visibility: 'internal' | 'public'; created_at: Date;
    }>(
      `SELECT author_label, kind, body, visibility, created_at
         FROM tickets.ticket_comments WHERE ticket_id = $1`, [id]),
    pool.query<{
      kind: LinkKind; to_id: string; pr_number: number | null;
      other_title: string; created_at: Date;
      pr_title: string | null; pr_merged_at: Date | null; pr_merged_by: string | null;
    }>(
      `SELECT l.kind, l.to_id, l.pr_number,
              ot.title AS other_title,
              l.created_at,
              pe.title AS pr_title, pe.merged_at AS pr_merged_at, pe.merged_by AS pr_merged_by
         FROM tickets.ticket_links l
         JOIN tickets.tickets ot ON ot.id = l.to_id
         LEFT JOIN tickets.pr_events pe ON pe.pr_number = l.pr_number
        WHERE l.from_id = $1`, [id]),
  ]);

  const entries: TimelineEntry[] = [];

  for (const a of activity.rows) {
    if (a.field === '_created') {
      entries.push({ kind: 'created', at: a.created_at, actor: a.actor_label, ticketId: id });
    } else if (a.field === '_updated') {
      // diff is JSONB { fieldName: { old, new } }
      const diff = (a.new_value as Record<string, { old: unknown; new: unknown }>) ?? {};
      entries.push({
        kind: 'updated', at: a.created_at, actor: a.actor_label, ticketId: id, diff,
      });
    }
    // Other field-named rows (legacy) are folded into 'updated' in PR1's batched diff,
    // so we ignore them here.
  }
  for (const c of comments.rows) {
    entries.push({
      kind: 'comment', at: c.created_at, actor: c.author_label, ticketId: id,
      body: c.body, visibility: c.visibility, commentKind: c.kind,
    });
  }
  for (const l of links.rows) {
    entries.push({
      kind: 'link_added', at: l.created_at, actor: null, ticketId: id,
      linkKind: l.kind, otherId: l.to_id, otherTitle: l.other_title, prNumber: l.pr_number,
    });
    if (l.pr_number && l.pr_merged_at && l.pr_title) {
      entries.push({
        kind: 'pr_merged', at: l.pr_merged_at, actor: l.pr_merged_by, ticketId: id,
        prNumber: l.pr_number, prTitle: l.pr_title, mergedBy: l.pr_merged_by,
      });
    }
  }

  entries.sort((a, b) => a.at.getTime() - b.at.getTime());
  return entries;
}

// ── Mutations (non-status). Status changes go through transitionTicket(). ───

export async function createAdminTicket(p: {
  brand: string;
  type: TicketType;
  title: string;
  description?: string;
  parentId?: string;
  customerId?: string;
  assigneeId?: string;
  reporterEmail?: string;
  priority?: TicketPriority;
  severity?: TicketSeverity;
  component?: string;
  thesisTag?: string;
  externalId?: string;
  startDate?: string;
  dueDate?: string;
  estimateMinutes?: number;
  actor: { id?: string; label: string };
}): Promise<string> {
  await initTicketsSchema();
  if (p.type === 'project' && !p.customerId) {
    throw new Error('createAdminTicket: customerId is required for type=project');
  }
  if (p.type === 'bug') {
    throw new Error('createAdminTicket: type=bug must be created via /api/bug-report (mints BR-id)');
  }
  // If parentId is given, it must belong to the same brand.
  if (p.parentId) {
    const par = await pool.query<{ brand: string }>(
      `SELECT brand FROM tickets.tickets WHERE id = $1`, [p.parentId]);
    if (par.rows.length === 0 || par.rows[0].brand !== p.brand) {
      throw new Error('createAdminTicket: parentId not found in brand');
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (p.actor.id) await client.query(`SELECT set_config('app.user_id', $1, true)`, [p.actor.id]);
    await client.query(`SELECT set_config('app.user_label', $1, true)`, [p.actor.label]);

    const r = await client.query<{ id: string }>(
      `INSERT INTO tickets.tickets
         (external_id, type, parent_id, brand, title, description,
          customer_id, assignee_id, reporter_email,
          priority, severity, component, thesis_tag,
          start_date, due_date, estimate_minutes,
          status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'triage')
       RETURNING id`,
      [
        p.externalId ?? null, p.type, p.parentId ?? null, p.brand,
        p.title, p.description ?? null,
        p.customerId ?? null, p.assigneeId ?? null, p.reporterEmail ?? null,
        p.priority ?? 'mittel', p.severity ?? null, p.component ?? null, p.thesisTag ?? null,
        p.startDate ?? null, p.dueDate ?? null, p.estimateMinutes ?? null,
      ]);
    await client.query('COMMIT');
    return r.rows[0].id;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function patchAdminTicket(p: {
  brand: string;
  id: string;
  title?: string;
  description?: string;
  notes?: string;
  url?: string;
  priority?: TicketPriority;
  severity?: TicketSeverity | null;
  component?: string | null;
  thesisTag?: string | null;
  parentId?: string | null;
  customerId?: string | null;
  assigneeId?: string | null;
  reporterEmail?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  estimateMinutes?: number | null;
  actor: { id?: string; label: string };
}): Promise<void> {
  await initTicketsSchema();
  // Brand-guard.
  const cur = await pool.query<{ brand: string }>(
    `SELECT brand FROM tickets.tickets WHERE id = $1`, [p.id]);
  if (cur.rows.length === 0 || cur.rows[0].brand !== p.brand) {
    throw new Error('patchAdminTicket: ticket not found in brand');
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  const push = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };

  if (p.title       !== undefined) push('title',           p.title);
  if (p.description !== undefined) push('description',     p.description);
  if (p.notes       !== undefined) push('notes',           p.notes);
  if (p.url         !== undefined) push('url',             p.url);
  if (p.priority    !== undefined) push('priority',        p.priority);
  if (p.severity    !== undefined) push('severity',        p.severity);
  if (p.component   !== undefined) push('component',       p.component);
  if (p.thesisTag   !== undefined) push('thesis_tag',      p.thesisTag);
  if (p.parentId    !== undefined) push('parent_id',       p.parentId);
  if (p.customerId  !== undefined) push('customer_id',     p.customerId);
  if (p.assigneeId  !== undefined) push('assignee_id',     p.assigneeId);
  if (p.reporterEmail !== undefined) push('reporter_email', p.reporterEmail);
  if (p.startDate   !== undefined) push('start_date',      p.startDate);
  if (p.dueDate     !== undefined) push('due_date',        p.dueDate);
  if (p.estimateMinutes !== undefined) push('estimate_minutes', p.estimateMinutes);

  if (sets.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (p.actor.id) await client.query(`SELECT set_config('app.user_id', $1, true)`, [p.actor.id]);
    await client.query(`SELECT set_config('app.user_label', $1, true)`, [p.actor.label]);
    vals.push(p.id);
    await client.query(
      `UPDATE tickets.tickets SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function addComment(p: {
  brand: string;
  ticketId: string;
  body: string;
  visibility: 'internal' | 'public';
  actor: { id?: string; label: string };
}): Promise<{ id: number; emailSent: boolean }> {
  await initTicketsSchema();
  const guard = await pool.query<{ brand: string; reporter_email: string | null; external_id: string | null; type: string }>(
    `SELECT brand, reporter_email, external_id, type FROM tickets.tickets WHERE id = $1`, [p.ticketId]);
  if (guard.rows.length === 0 || guard.rows[0].brand !== p.brand) {
    throw new Error('addComment: ticket not found in brand');
  }
  const trimmed = p.body.trim();
  if (!trimmed) throw new Error('addComment: empty body');
  if (trimmed.length > 4000) throw new Error('addComment: body too long (max 4000)');

  const r = await pool.query<{ id: number }>(
    `INSERT INTO tickets.ticket_comments
       (ticket_id, author_id, author_label, kind, body, visibility)
     VALUES ($1, $2, $3, 'comment', $4, $5)
     RETURNING id`,
    [p.ticketId, p.actor.id ?? null, p.actor.label, trimmed, p.visibility]);

  let emailSent = false;
  if (p.visibility === 'public' && guard.rows[0].reporter_email && guard.rows[0].type === 'bug') {
    const { sendPublicCommentEmail } = await import('./email-templates');
    emailSent = await sendPublicCommentEmail({
      externalId: guard.rows[0].external_id ?? p.ticketId,
      reporterEmail: guard.rows[0].reporter_email,
      body: trimmed,
    });
  }
  return { id: r.rows[0].id, emailSent };
}

export async function addLink(p: {
  brand: string;
  fromId: string;
  toId: string;
  kind: LinkKind;
  prNumber?: number;
  actor: { id?: string; label: string };
}): Promise<{ id: number }> {
  await initTicketsSchema();
  if (p.fromId === p.toId) throw new Error('addLink: cannot link a ticket to itself');
  const both = await pool.query<{ id: string; brand: string }>(
    `SELECT id, brand FROM tickets.tickets WHERE id = ANY($1::uuid[])`,
    [[p.fromId, p.toId]]);
  if (both.rowCount !== 2 || both.rows.some(r => r.brand !== p.brand)) {
    throw new Error('addLink: both tickets must exist and belong to the same brand');
  }
  const r = await pool.query<{ id: number }>(
    `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (from_id, to_id, kind) DO UPDATE SET pr_number = EXCLUDED.pr_number
     RETURNING id`,
    [p.fromId, p.toId, p.kind, p.prNumber ?? null, p.actor.id ?? null]);
  return { id: r.rows[0].id };
}

export async function removeLink(brand: string, fromId: string, linkId: number): Promise<void> {
  await initTicketsSchema();
  // Brand-guard: ensure the link's from-side ticket belongs to this brand.
  const r = await pool.query(
    `DELETE FROM tickets.ticket_links l
       USING tickets.tickets t
      WHERE l.id = $1 AND l.from_id = $2 AND t.id = l.from_id AND t.brand = $3`,
    [linkId, fromId, brand]);
  if (r.rowCount === 0) throw new Error('removeLink: link not found in brand');
}

export async function addAttachment(p: {
  brand: string;
  ticketId: string;
  filename: string;
  mimeType: string;
  dataUrl: string;
  fileSize?: number | null;
  actor: { id?: string; label: string };
}): Promise<{ id: string }> {
  await initTicketsSchema();
  const guard = await pool.query<{ brand: string }>(
    `SELECT brand FROM tickets.tickets WHERE id = $1`, [p.ticketId]);
  if (guard.rows.length === 0 || guard.rows[0].brand !== p.brand) {
    throw new Error('addAttachment: ticket not found in brand');
  }
  const r = await pool.query<{ id: string }>(
    `INSERT INTO tickets.ticket_attachments
       (ticket_id, filename, data_url, mime_type, file_size, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [p.ticketId, p.filename, p.dataUrl, p.mimeType, p.fileSize ?? null, p.actor.id ?? null]);
  return { id: r.rows[0].id };
}

// ── Lookups for the action bar dropdowns ───────────────────────────────────

export async function listAdminUsersForBrand(): Promise<Customer[]> {
  // Admin users are global (no brand) — same as the projekte page.
  const { listAdminUsers } = await import('../website-db');
  return listAdminUsers();
}

export async function listCustomersForBrand(): Promise<Customer[]> {
  const { listAllCustomers } = await import('../website-db');
  return listAllCustomers();
}

export async function searchTicketsForLink(brand: string, q: string, limit = 10): Promise<ListedTicket[]> {
  await initTicketsSchema();
  if (q.trim().length < 2) return [];
  const r = await pool.query<ListedTicket>(
    `${LIST_SELECT}
     WHERE t.brand = $1
       AND (t.title ILIKE '%' || $2 || '%' OR t.external_id ILIKE '%' || $2 || '%')
     ${LIST_ORDER}
     LIMIT $3`,
    [brand, q, limit]);
  return r.rows;
}

// ── Distinct components for the filter dropdown ─────────────────────────────

export async function listKnownComponents(brand: string): Promise<string[]> {
  await initTicketsSchema();
  const r = await pool.query<{ component: string }>(
    `SELECT DISTINCT component FROM tickets.tickets
      WHERE brand = $1 AND component IS NOT NULL ORDER BY component`,
    [brand]);
  return r.rows.map(x => x.component);
}

export async function listKnownThesisTags(brand: string): Promise<string[]> {
  await initTicketsSchema();
  const r = await pool.query<{ thesis_tag: string }>(
    `SELECT DISTINCT thesis_tag FROM tickets.tickets
      WHERE brand = $1 AND thesis_tag IS NOT NULL ORDER BY thesis_tag`,
    [brand]);
  return r.rows.map(x => x.thesis_tag);
}
```

- [ ] **Step 3: Verify TypeScript compiles.**

Run: `cd website && npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.
If it fails because `email-templates.ts` does not export `sendPublicCommentEmail`, **stop and add it as part of this task** — see Step 4 below. (It is referenced by `addComment` for public-comment notifications. Spec §7 lists this as a notification trigger.)

- [ ] **Step 4: If `sendPublicCommentEmail` is missing from `email-templates.ts`, add it.**

Run `grep -n 'sendPublicCommentEmail\|export async function' website/src/lib/tickets/email-templates.ts`. If the function does not exist, append the following to that file:

```ts
import { sendEmail } from '../email';

export async function sendPublicCommentEmail(p: {
  externalId: string;
  reporterEmail: string;
  body: string;
}): Promise<boolean> {
  const BRAND_NAME    = process.env.BRAND_NAME    ?? 'mentolder';
  const PROD_DOMAIN   = process.env.PROD_DOMAIN   ?? 'mentolder.de';
  const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? `info@${PROD_DOMAIN}`;
  try {
    await sendEmail({
      to: p.reporterEmail,
      bcc: CONTACT_EMAIL,
      replyTo: CONTACT_EMAIL,
      subject: `[${p.externalId}] Antwort vom ${BRAND_NAME}-Team`,
      text:
`Hallo,

zu Ihrer Meldung ${p.externalId} gibt es eine neue Nachricht vom Team:

${p.body}

Antworten Sie einfach auf diese E-Mail, um zurückzuschreiben.

Mit freundlichen Grüßen
${BRAND_NAME}`,
    });
    return true;
  } catch (err) {
    console.error('[sendPublicCommentEmail] failed:', err);
    return false;
  }
}
```

Re-run `npx tsc --noEmit` and confirm zero errors.

- [ ] **Step 5: Commit.**

```bash
git add website/src/lib/tickets/admin.ts website/src/lib/tickets/email-templates.ts
git commit -m "feat(tickets): add brand-scoped admin helpers (PR4/5)"
```

---

## Task 2: API endpoint — `GET / POST /api/admin/tickets`

**Files:**
- Create: `website/src/pages/api/admin/tickets/index.ts`

- [ ] **Step 1: Write the file.**

```ts
// website/src/pages/api/admin/tickets/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import {
  listAdminTickets, countAdminTickets, createAdminTicket,
  type ListFilters, type TicketType, type TicketPriority, type TicketSeverity,
} from '../../../../lib/tickets/admin';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const sp = url.searchParams;
  const filters: ListFilters = {
    brand: BRAND(),
    type:        (sp.get('type')        as TicketType)        ?? undefined,
    status:      (sp.get('status')      as ListFilters['status']) ?? undefined,
    component:   sp.get('component')    ?? undefined,
    assigneeId:  sp.get('assigneeId')   ?? undefined,
    customerId:  sp.get('customerId')   ?? undefined,
    thesisTag:   sp.get('thesisTag')    ?? undefined,
    tagName:     sp.get('tag')          ?? undefined,
    q:           sp.get('q')            ?? undefined,
    parentIsNull: sp.get('flat') === '1' ? false : true,
    limit:  Number(sp.get('limit')  ?? 100),
    offset: Number(sp.get('offset') ?? 0),
  };
  const [items, total] = await Promise.all([
    listAdminTickets(filters), countAdminTickets(filters),
  ]);
  return new Response(JSON.stringify({ items, total }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }

  const type = body.type as TicketType;
  if (!type || !['feature','task','project'].includes(type)) {
    return new Response(JSON.stringify({
      error: 'type must be feature|task|project (bugs are minted via /api/bug-report)',
    }), { status: 400 });
  }
  const title = String(body.title ?? '').trim();
  if (!title) return new Response(JSON.stringify({ error: 'title is required' }), { status: 400 });

  try {
    const id = await createAdminTicket({
      brand: BRAND(),
      type,
      title,
      description:    typeof body.description === 'string' ? body.description : undefined,
      parentId:       typeof body.parentId    === 'string' ? body.parentId    : undefined,
      customerId:     typeof body.customerId  === 'string' ? body.customerId  : undefined,
      assigneeId:     typeof body.assigneeId  === 'string' ? body.assigneeId  : undefined,
      reporterEmail:  typeof body.reporterEmail === 'string' ? body.reporterEmail : undefined,
      priority:       body.priority as TicketPriority | undefined,
      severity:       body.severity as TicketSeverity | undefined,
      component:      typeof body.component  === 'string' ? body.component  : undefined,
      thesisTag:      typeof body.thesisTag  === 'string' ? body.thesisTag  : undefined,
      externalId:     typeof body.externalId === 'string' ? body.externalId : undefined,
      startDate:      typeof body.startDate  === 'string' ? body.startDate  : undefined,
      dueDate:        typeof body.dueDate    === 'string' ? body.dueDate    : undefined,
      estimateMinutes: typeof body.estimateMinutes === 'number' ? body.estimateMinutes : undefined,
      actor: { label: session.preferred_username },
    });
    return new Response(JSON.stringify({ ok: true, id }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'create failed';
    console.error('[api/admin/tickets POST]', err);
    return new Response(JSON.stringify({ error: msg }), { status: 400 });
  }
};
```

- [ ] **Step 2: Verify TypeScript compiles.**

Run: `cd website && npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.

- [ ] **Step 3: Commit.**

```bash
git add website/src/pages/api/admin/tickets/index.ts
git commit -m "feat(tickets): add admin tickets list+create API (PR4/5)"
```

---

## Task 3: API endpoint — `GET / PATCH /api/admin/tickets/[id]`

**Files:**
- Create: `website/src/pages/api/admin/tickets/[id].ts`

- [ ] **Step 1: Write the file.**

```ts
// website/src/pages/api/admin/tickets/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getTicketDetail, getTicketTimeline, patchAdminTicket } from '../../../../lib/tickets/admin';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

export const GET: APIRoute = async ({ request, params, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  const [detail, timeline] = await Promise.all([
    getTicketDetail(BRAND(), id),
    url.searchParams.get('timeline') === '1' ? getTicketTimeline(BRAND(), id) : Promise.resolve(null),
  ]);
  if (!detail) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  return new Response(JSON.stringify({ ticket: detail, timeline }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }

  // Reject status/resolution — they go through /transition.
  if ('status' in body || 'resolution' in body) {
    return new Response(JSON.stringify({
      error: 'use /api/admin/tickets/:id/transition for status changes',
    }), { status: 400 });
  }

  try {
    await patchAdminTicket({
      brand: BRAND(),
      id,
      ...body as Record<string, never>,  // narrow + pass through
      actor: { label: session.preferred_username },
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'patch failed';
    const status = msg.includes('not found') ? 404 : 400;
    return new Response(JSON.stringify({ error: msg }), { status });
  }
};
```

- [ ] **Step 2: Verify TypeScript compiles.**

Run: `cd website && npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.

If the spread `...body as Record<string, never>` fails type-checking (it might, depending on tsconfig strictness), replace it with explicit destructuring of the allowed fields. A safe alternative is:

```ts
    const allowed = ['title','description','notes','url','priority','severity','component',
                     'thesisTag','parentId','customerId','assigneeId','reporterEmail',
                     'startDate','dueDate','estimateMinutes'] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) patch[k] = (body as Record<string, unknown>)[k];
    await patchAdminTicket({
      brand: BRAND(), id, ...patch, actor: { label: session.preferred_username },
    } as Parameters<typeof patchAdminTicket>[0]);
```

- [ ] **Step 3: Commit.**

```bash
git add website/src/pages/api/admin/tickets/\[id\].ts
git commit -m "feat(tickets): add admin ticket detail+patch API (PR4/5)"
```

---

## Task 4: API endpoint — `POST /api/admin/tickets/[id]/transition`

**Files:**
- Create: `website/src/pages/api/admin/tickets/[id]/transition.ts`

- [ ] **Step 1: Write the file.**

```ts
// website/src/pages/api/admin/tickets/[id]/transition.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { transitionTicket } from '../../../../../lib/tickets/transition';
import type { TicketStatus, TicketResolution } from '../../../../../lib/tickets/transition';
import { pool } from '../../../../../lib/website-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }

  const status = body.status as TicketStatus | undefined;
  if (!status) {
    return new Response(JSON.stringify({ error: 'status is required' }), { status: 400 });
  }

  // Brand-guard before calling transitionTicket(): refuse cross-brand transitions.
  const guard = await pool.query<{ brand: string }>(
    `SELECT brand FROM tickets.tickets WHERE id = $1`, [id]);
  if (guard.rows.length === 0 || guard.rows[0].brand !== BRAND()) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  }

  try {
    const result = await transitionTicket(id, {
      status,
      resolution: body.resolution as TicketResolution | undefined,
      note:  typeof body.note  === 'string' ? body.note  : undefined,
      noteVisibility: body.noteVisibility === 'public' ? 'public' : 'internal',
      actor: { label: session.preferred_username },
    });
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'transition failed';
    return new Response(JSON.stringify({ error: msg }), { status: 400 });
  }
};
```

- [ ] **Step 2: Verify TypeScript compiles.**

Run: `cd website && npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.

- [ ] **Step 3: Commit.**

```bash
git add website/src/pages/api/admin/tickets/\[id\]/transition.ts
git commit -m "feat(tickets): add admin transition API (PR4/5)"
```

---

## Task 5: API endpoint — `POST /api/admin/tickets/[id]/comments`

**Files:**
- Create: `website/src/pages/api/admin/tickets/[id]/comments.ts`

- [ ] **Step 1: Write the file.**

```ts
// website/src/pages/api/admin/tickets/[id]/comments.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { addComment } from '../../../../../lib/tickets/admin';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }

  const text = String(body.body ?? '').trim();
  if (!text) return new Response(JSON.stringify({ error: 'body is required' }), { status: 400 });
  if (text.length > 4000) {
    return new Response(JSON.stringify({ error: 'body too long (max 4000)' }), { status: 400 });
  }

  try {
    const r = await addComment({
      brand: BRAND(),
      ticketId: id,
      body: text,
      visibility: body.visibility === 'public' ? 'public' : 'internal',
      actor: { label: session.preferred_username },
    });
    return new Response(JSON.stringify({ ok: true, ...r }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'comment failed';
    const status = msg.includes('not found') ? 404 : 400;
    return new Response(JSON.stringify({ error: msg }), { status });
  }
};
```

- [ ] **Step 2: Verify TypeScript compiles.**

Run: `cd website && npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.

- [ ] **Step 3: Commit.**

```bash
git add website/src/pages/api/admin/tickets/\[id\]/comments.ts
git commit -m "feat(tickets): add admin ticket comments API (PR4/5)"
```

---

## Task 6: API endpoint — `POST,DELETE /api/admin/tickets/[id]/links`

**Files:**
- Create: `website/src/pages/api/admin/tickets/[id]/links.ts`

- [ ] **Step 1: Write the file.**

```ts
// website/src/pages/api/admin/tickets/[id]/links.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { addLink, removeLink, type LinkKind } from '../../../../../lib/tickets/admin';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

const VALID_KINDS: ReadonlySet<LinkKind> = new Set(
  ['blocks','blocked_by','duplicate_of','relates_to','fixes','fixed_by']);

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const fromId = String(params.id ?? '');
  if (!fromId) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }

  const kind = body.kind as LinkKind;
  const toId = String(body.toId ?? '').trim();
  if (!VALID_KINDS.has(kind)) return new Response(JSON.stringify({ error: 'invalid kind' }), { status: 400 });
  if (!toId) return new Response(JSON.stringify({ error: 'toId required' }), { status: 400 });

  try {
    const r = await addLink({
      brand: BRAND(),
      fromId, toId, kind,
      prNumber: typeof body.prNumber === 'number' ? body.prNumber : undefined,
      actor: { label: session.preferred_username },
    });
    return new Response(JSON.stringify({ ok: true, id: r.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'link failed' }),
      { status: 400 });
  }
};

export const DELETE: APIRoute = async ({ request, params, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const fromId = String(params.id ?? '');
  const linkId = Number(url.searchParams.get('linkId') ?? '0');
  if (!fromId || !Number.isInteger(linkId) || linkId <= 0) {
    return new Response(JSON.stringify({ error: 'fromId+linkId required' }), { status: 400 });
  }
  try {
    await removeLink(BRAND(), fromId, linkId);
    return new Response(JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'unlink failed' }),
      { status: 400 });
  }
};
```

- [ ] **Step 2: Verify TypeScript compiles.**

Run: `cd website && npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.

- [ ] **Step 3: Commit.**

```bash
git add website/src/pages/api/admin/tickets/\[id\]/links.ts
git commit -m "feat(tickets): add admin ticket links API (PR4/5)"
```

---

## Task 7: API endpoint — `POST /api/admin/tickets/[id]/attachments`

**Files:**
- Create: `website/src/pages/api/admin/tickets/[id]/attachments.ts`

- [ ] **Step 1: Write the file.**

```ts
// website/src/pages/api/admin/tickets/[id]/attachments.ts
//
// Multipart upload, ≤ 5 MB. Stored as data_url for v1 (matches what the public
// bug-report endpoint does). Nextcloud-backed uploads are deferred to v1.5.
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { addAttachment } from '../../../../../lib/tickets/admin';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const MAX_BYTES = 5 * 1024 * 1024;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('multipart/form-data')) {
    return new Response(JSON.stringify({ error: 'multipart required' }), { status: 400 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'file required' }), { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: `file too large (max ${MAX_BYTES} bytes)` }),
      { status: 413 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || 'application/octet-stream';
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

  try {
    const r = await addAttachment({
      brand: BRAND(),
      ticketId: id,
      filename: file.name || 'unnamed',
      mimeType: mime,
      dataUrl,
      fileSize: file.size,
      actor: { label: session.preferred_username },
    });
    return new Response(JSON.stringify({ ok: true, id: r.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'upload failed' }),
      { status: 400 });
  }
};
```

- [ ] **Step 2: Verify TypeScript compiles.**

Run: `cd website && npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.

- [ ] **Step 3: Commit.**

```bash
git add website/src/pages/api/admin/tickets/\[id\]/attachments.ts
git commit -m "feat(tickets): add admin ticket attachments API (PR4/5)"
```

---

## Task 8: Component — `TicketActivityTimeline.svelte`

**Why:** One Svelte component renders the merged timeline (created, field-updated, comment, link, PR-merged). The detail page imports it and passes the `TimelineEntry[]` array. Used only on the detail page in PR4 but shaped so a future portal page can reuse it.

**Files:**
- Create: `website/src/components/admin/TicketActivityTimeline.svelte`

- [ ] **Step 1: Write the file.**

```svelte
<!-- website/src/components/admin/TicketActivityTimeline.svelte -->
<script lang="ts">
  import type { TimelineEntry } from '../../lib/tickets/admin';
  export let entries: TimelineEntry[] = [];

  const FIELD_LABEL: Record<string, string> = {
    status:        'Status',
    resolution:    'Resolution',
    priority:      'Priorität',
    severity:      'Severität',
    assignee_id:   'Zuständig',
    customer_id:   'Kunde',
    reporter_id:   'Reporter',
    reporter_email:'Reporter-E-Mail',
    title:         'Titel',
    description:   'Beschreibung',
    url:           'URL',
    component:     'Komponente',
    thesis_tag:    'Thesis-Tag',
    parent_id:     'Parent',
    start_date:    'Start',
    due_date:      'Fällig',
    estimate_minutes: 'Schätzung',
  };

  const LINK_KIND_LABEL: Record<string, string> = {
    blocks:        'blockt',
    blocked_by:    'blockiert von',
    duplicate_of:  'Duplikat von',
    relates_to:    'verwandt mit',
    fixes:         'behebt',
    fixed_by:      'behoben durch',
  };

  function fmt(d: Date | string): string {
    return new Date(d).toLocaleString('de-DE',
      { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fmtVal(v: unknown): string {
    if (v === null || v === undefined || v === '') return '∅';
    if (typeof v === 'string')  return v.length > 80 ? v.slice(0, 80) + '…' : v;
    if (typeof v === 'number')  return String(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return JSON.stringify(v).slice(0, 80);
  }
</script>

<ol class="ticket-timeline">
  {#each entries as e (e.at + '-' + e.kind)}
    <li class="ticket-timeline-row">
      <span class="ticket-timeline-dot" data-kind={e.kind}></span>
      <div class="ticket-timeline-body">
        <div class="ticket-timeline-meta">
          <span class="ticket-timeline-actor">{e.actor ?? 'system'}</span>
          <span class="ticket-timeline-when">{fmt(e.at)}</span>
        </div>

        {#if e.kind === 'created'}
          <p>Ticket erstellt</p>
        {:else if e.kind === 'updated'}
          <ul class="ticket-timeline-diff">
            {#each Object.entries(e.diff) as [field, change]}
              <li>
                <strong>{FIELD_LABEL[field] ?? field}:</strong>
                <span class="old">{fmtVal(change.old)}</span>
                →
                <span class="new">{fmtVal(change.new)}</span>
              </li>
            {/each}
          </ul>
        {:else if e.kind === 'comment'}
          <div class="ticket-timeline-comment" data-visibility={e.visibility}>
            {#if e.visibility === 'public'}
              <span class="ticket-timeline-badge">öffentlich</span>
            {:else}
              <span class="ticket-timeline-badge">intern</span>
            {/if}
            {#if e.commentKind !== 'comment'}
              <span class="ticket-timeline-badge alt">{e.commentKind}</span>
            {/if}
            <p style="white-space: pre-wrap; margin: 4px 0 0;">{e.body}</p>
          </div>
        {:else if e.kind === 'link_added'}
          <p>
            Verknüpfung: <strong>{LINK_KIND_LABEL[e.linkKind] ?? e.linkKind}</strong>
            <a href={`/admin/tickets/${e.otherId}`}>{e.otherTitle}</a>
            {#if e.prNumber}
              <span class="ticket-timeline-pr">(PR #{e.prNumber})</span>
            {/if}
          </p>
        {:else if e.kind === 'pr_merged'}
          <p>
            PR <a href={`https://github.com/Paddione/Bachelorprojekt/pull/${e.prNumber}`}
                  target="_blank" rel="noopener">#{e.prNumber}</a>
            gemergt: {e.prTitle}
            {#if e.mergedBy} — {e.mergedBy}{/if}
          </p>
        {/if}
      </div>
    </li>
  {/each}
  {#if entries.length === 0}
    <li class="ticket-timeline-empty">Noch keine Aktivität.</li>
  {/if}
</ol>

<style>
  .ticket-timeline {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column; gap: 14px;
  }
  .ticket-timeline-row { display: grid; grid-template-columns: 16px 1fr; gap: 12px; }
  .ticket-timeline-dot {
    width: 10px; height: 10px; border-radius: 50%; margin-top: 6px;
    background: var(--mute, #888); border: 2px solid var(--ink-900, #0f1623);
    box-shadow: 0 0 0 2px var(--brass-d, #2a3a52);
  }
  .ticket-timeline-dot[data-kind="comment"] { background: var(--brass, #e8c870); }
  .ticket-timeline-dot[data-kind="link_added"] { background: #6ab0ff; }
  .ticket-timeline-dot[data-kind="pr_merged"]  { background: #8be3a0; }
  .ticket-timeline-dot[data-kind="created"]    { background: #b48ce8; }
  .ticket-timeline-meta {
    font-size: 11px; color: var(--mute, #aabbcc); display: flex; gap: 10px; margin-bottom: 2px;
  }
  .ticket-timeline-actor { color: var(--fg, #e8e8f0); font-weight: 500; }
  .ticket-timeline-diff { list-style: none; padding: 0; margin: 0; font-size: 13px; }
  .ticket-timeline-diff .old { color: var(--mute, #aabbcc); text-decoration: line-through; }
  .ticket-timeline-diff .new { color: var(--brass, #e8c870); }
  .ticket-timeline-comment {
    background: rgba(255,255,255,0.04); border-radius: 8px; padding: 8px 10px;
    border-left: 3px solid var(--brass, #e8c870);
  }
  .ticket-timeline-comment[data-visibility="public"] {
    border-left-color: #8be3a0;
  }
  .ticket-timeline-badge {
    font-size: 10px; padding: 1px 6px; border-radius: 4px;
    background: rgba(232,200,112,0.15); color: var(--brass, #e8c870);
    font-family: monospace; text-transform: lowercase;
  }
  .ticket-timeline-badge.alt { background: rgba(255,255,255,0.1); color: var(--fg, #e8e8f0); }
  .ticket-timeline-pr { color: var(--mute, #aabbcc); font-family: monospace; font-size: 12px; }
  .ticket-timeline-empty { color: var(--mute, #aabbcc); font-size: 13px; padding: 8px 0; }
  a { color: var(--brass, #e8c870); }
  a:hover { text-decoration: underline; }
</style>
```

- [ ] **Step 2: Verify Astro/Svelte compiles.**

Run: `cd website && npx astro check 2>&1 | tail -40`
Expected: no errors related to this file. (Other unrelated warnings are fine.)

- [ ] **Step 3: Commit.**

```bash
git add website/src/components/admin/TicketActivityTimeline.svelte
git commit -m "feat(tickets): add unified activity timeline component (PR4/5)"
```

---

## Task 9: Component — `TicketActionBar.svelte`

**Why:** Provides four action surfaces in the detail-page header: Transition (status select + resolution + note), Add comment (visibility toggle), Add link (kind + ticket-search), Add watcher. All four POST to the API and refresh the page on success (no client-side cache to invalidate — simplest correct path).

**Files:**
- Create: `website/src/components/admin/TicketActionBar.svelte`

- [ ] **Step 1: Write the file.**

```svelte
<!-- website/src/components/admin/TicketActionBar.svelte -->
<script lang="ts">
  import type { TicketStatus, TicketResolution, ListedTicket, LinkKind } from '../../lib/tickets/admin';

  export let ticketId: string;
  export let currentStatus: TicketStatus;

  let mode: '' | 'transition' | 'comment' | 'link' = '';
  let busy = false;
  let error = '';

  // Transition state
  let nextStatus: TicketStatus = currentStatus;
  let resolution: TicketResolution | '' = '';
  let transitionNote = '';
  let transitionVisibility: 'internal' | 'public' = 'internal';

  // Comment state
  let commentBody = '';
  let commentVisibility: 'internal' | 'public' = 'internal';

  // Link state
  let linkKind: LinkKind = 'relates_to';
  let linkQuery = '';
  let linkResults: ListedTicket[] = [];
  let linkSelectedId = '';
  let linkPrNumber: number | null = null;

  const STATUSES: TicketStatus[] = ['triage','backlog','in_progress','in_review','blocked','done','archived'];
  const RESOLUTIONS: TicketResolution[] = ['fixed','shipped','wontfix','duplicate','cant_reproduce','obsolete'];
  const LINK_KINDS: LinkKind[] = ['blocks','blocked_by','duplicate_of','relates_to','fixes','fixed_by'];

  function reset() {
    mode = ''; busy = false; error = '';
    nextStatus = currentStatus; resolution = ''; transitionNote = ''; transitionVisibility = 'internal';
    commentBody = ''; commentVisibility = 'internal';
    linkKind = 'relates_to'; linkQuery = ''; linkResults = []; linkSelectedId = ''; linkPrNumber = null;
  }

  async function searchLink() {
    if (linkQuery.trim().length < 2) { linkResults = []; return; }
    const r = await fetch(`/api/admin/tickets?q=${encodeURIComponent(linkQuery)}&limit=10`);
    if (r.ok) {
      const j = await r.json() as { items: ListedTicket[] };
      linkResults = j.items.filter(it => it.id !== ticketId);
    }
  }

  async function submitTransition() {
    busy = true; error = '';
    const needsResolution = nextStatus === 'done' || nextStatus === 'archived';
    if (needsResolution && !resolution) { error = 'Resolution erforderlich für done/archived.'; busy = false; return; }
    const r = await fetch(`/api/admin/tickets/${ticketId}/transition`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: nextStatus,
        resolution: needsResolution ? resolution : undefined,
        note: transitionNote || undefined,
        noteVisibility: transitionVisibility,
      }),
    });
    if (!r.ok) { error = (await r.json()).error ?? 'Transition fehlgeschlagen'; busy = false; return; }
    location.reload();
  }

  async function submitComment() {
    busy = true; error = '';
    const r = await fetch(`/api/admin/tickets/${ticketId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: commentBody, visibility: commentVisibility }),
    });
    if (!r.ok) { error = (await r.json()).error ?? 'Kommentar fehlgeschlagen'; busy = false; return; }
    location.reload();
  }

  async function submitLink() {
    busy = true; error = '';
    if (!linkSelectedId) { error = 'Ziel-Ticket wählen.'; busy = false; return; }
    const r = await fetch(`/api/admin/tickets/${ticketId}/links`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toId: linkSelectedId, kind: linkKind,
        prNumber: linkPrNumber ?? undefined,
      }),
    });
    if (!r.ok) { error = (await r.json()).error ?? 'Link fehlgeschlagen'; busy = false; return; }
    location.reload();
  }
</script>

<div class="ticket-action-bar">
  <button type="button" on:click={() => mode = 'transition'} class:active={mode === 'transition'}>Status ändern</button>
  <button type="button" on:click={() => mode = 'comment'}    class:active={mode === 'comment'}>Kommentar</button>
  <button type="button" on:click={() => mode = 'link'}       class:active={mode === 'link'}>Verknüpfen</button>

  {#if mode === 'transition'}
    <div class="ticket-action-panel">
      <label>Status<select bind:value={nextStatus} disabled={busy}>
        {#each STATUSES as s}<option value={s}>{s}</option>{/each}
      </select></label>
      {#if nextStatus === 'done' || nextStatus === 'archived'}
        <label>Resolution<select bind:value={resolution} disabled={busy}>
          <option value="">— wählen —</option>
          {#each RESOLUTIONS as r}<option value={r}>{r}</option>{/each}
        </select></label>
      {/if}
      <label>Notiz (optional)<textarea bind:value={transitionNote} disabled={busy}
        rows="2" maxlength="2000" placeholder="Warum dieser Übergang?"></textarea></label>
      <label class="row">
        <input type="checkbox" disabled={busy}
          checked={transitionVisibility === 'public'}
          on:change={(e) => transitionVisibility = e.currentTarget.checked ? 'public' : 'internal'} />
        Notiz öffentlich (Reporter sieht sie in der Close-Mail)
      </label>
      <div class="actions">
        <button type="button" on:click={reset} disabled={busy}>Abbrechen</button>
        <button type="button" class="primary" on:click={submitTransition} disabled={busy}>Speichern</button>
      </div>
    </div>
  {:else if mode === 'comment'}
    <div class="ticket-action-panel">
      <label>Text<textarea bind:value={commentBody} disabled={busy}
        rows="3" maxlength="4000" placeholder="Kommentar (max. 4000 Zeichen)"></textarea></label>
      <label class="row">
        <input type="checkbox" disabled={busy}
          checked={commentVisibility === 'public'}
          on:change={(e) => commentVisibility = e.currentTarget.checked ? 'public' : 'internal'} />
        Öffentlich (E-Mail an Reporter)
      </label>
      <div class="actions">
        <button type="button" on:click={reset} disabled={busy}>Abbrechen</button>
        <button type="button" class="primary" on:click={submitComment} disabled={busy || !commentBody.trim()}>
          Posten
        </button>
      </div>
    </div>
  {:else if mode === 'link'}
    <div class="ticket-action-panel">
      <label>Beziehung<select bind:value={linkKind} disabled={busy}>
        {#each LINK_KINDS as k}<option value={k}>{k}</option>{/each}
      </select></label>
      <label>Ziel suchen
        <input type="text" bind:value={linkQuery} on:input={searchLink} disabled={busy}
          placeholder="Titel oder Ticket-ID" />
      </label>
      {#if linkResults.length > 0}
        <ul class="ticket-link-results">
          {#each linkResults as r (r.id)}
            <li>
              <label>
                <input type="radio" bind:group={linkSelectedId} value={r.id} />
                <span class="mono">{r.externalId ?? r.id.slice(0, 8)}</span>
                <span>{r.title}</span>
                <span class="mute">[{r.type} · {r.status}]</span>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
      {#if linkKind === 'fixes' || linkKind === 'fixed_by'}
        <label>PR-Nummer (optional)
          <input type="number" bind:value={linkPrNumber} disabled={busy} min="1" />
        </label>
      {/if}
      <div class="actions">
        <button type="button" on:click={reset} disabled={busy}>Abbrechen</button>
        <button type="button" class="primary" on:click={submitLink} disabled={busy || !linkSelectedId}>
          Verknüpfen
        </button>
      </div>
    </div>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}
</div>

<style>
  .ticket-action-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
  .ticket-action-bar > button {
    padding: 6px 12px; font-size: 13px; border-radius: 6px;
    border: 1px solid var(--brass-d, #2a3a52); background: var(--ink-850, #1a2235); color: var(--fg, #e8e8f0);
    cursor: pointer;
  }
  .ticket-action-bar > button.active { background: var(--brass, #e8c870); color: var(--ink-900, #0f1623); border-color: var(--brass, #e8c870); }
  .ticket-action-panel {
    flex-basis: 100%; padding: 12px; background: var(--ink-850, #1a2235);
    border: 1px solid var(--brass-d, #2a3a52); border-radius: 10px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .ticket-action-panel label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--mute, #aabbcc); }
  .ticket-action-panel label.row { flex-direction: row; align-items: center; gap: 6px; }
  .ticket-action-panel input[type="text"], .ticket-action-panel input[type="number"], .ticket-action-panel select, .ticket-action-panel textarea {
    background: var(--ink-900, #0f1623); border: 1px solid var(--brass-d, #2a3a52);
    border-radius: 6px; padding: 6px 8px; color: var(--fg, #e8e8f0); font-size: 13px;
  }
  .actions { display: flex; gap: 8px; justify-content: flex-end; }
  .actions button { padding: 6px 14px; font-size: 13px; border-radius: 6px; cursor: pointer; }
  .actions button.primary { background: var(--brass, #e8c870); color: var(--ink-900, #0f1623); border: 1px solid var(--brass, #e8c870); }
  .ticket-link-results { list-style: none; padding: 0; margin: 0; max-height: 200px; overflow-y: auto;
    border: 1px solid var(--brass-d, #2a3a52); border-radius: 6px; }
  .ticket-link-results li { padding: 4px 8px; font-size: 12px; }
  .ticket-link-results li:hover { background: rgba(255,255,255,0.04); }
  .mono { font-family: monospace; color: var(--brass, #e8c870); }
  .mute { color: var(--mute, #aabbcc); font-size: 11px; }
  .error { color: #ff6b6b; font-size: 12px; margin: 0; }
</style>
```

- [ ] **Step 2: Verify Astro/Svelte compiles.**

Run: `cd website && npx astro check 2>&1 | tail -40`
Expected: no errors related to this file.

- [ ] **Step 3: Commit.**

```bash
git add website/src/components/admin/TicketActionBar.svelte
git commit -m "feat(tickets): add admin ticket action bar component (PR4/5)"
```

---

## Task 10: Page — `/admin/tickets` index

**Files:**
- Create: `website/src/pages/admin/tickets.astro`

- [ ] **Step 1: Write the file.**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import {
  listAdminTickets, countAdminTickets, listKnownComponents,
  type ListedTicket, type ListFilters, type TicketType, type TicketStatus,
} from '../../lib/tickets/admin';
import { listAllCustomers, listAdminUsers } from '../../lib/website-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname + Astro.url.search));
if (!isAdmin(session)) return Astro.redirect('/admin');

const BRAND = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const sp    = Astro.url.searchParams;

const typeFilter      = sp.get('type')       ?? '';
const statusFilter    = sp.get('status')     ?? 'open';
const componentFilter = sp.get('component')  ?? '';
const assigneeFilter  = sp.get('assigneeId') ?? '';
const customerFilter  = sp.get('customerId') ?? '';
const tagFilter       = sp.get('tag')        ?? '';
const thesisFilter    = sp.get('thesisTag')  ?? '';
const qFilter         = sp.get('q')          ?? '';

const filters: ListFilters = {
  brand:        BRAND,
  type:         (typeFilter as TicketType) || undefined,
  status:       statusFilter === 'all' ? undefined : (statusFilter as TicketStatus | 'open'),
  component:    componentFilter || undefined,
  assigneeId:   assigneeFilter  || undefined,
  customerId:   customerFilter  || undefined,
  thesisTag:    thesisFilter    || undefined,
  tagName:      tagFilter       || undefined,
  q:            qFilter         || undefined,
  parentIsNull: true,
  limit:        200,
};

let tickets:   ListedTicket[] = [];
let total      = 0;
let components: string[] = [];
let customers: Awaited<ReturnType<typeof listAllCustomers>> = [];
let admins:    Awaited<ReturnType<typeof listAdminUsers>>   = [];
let dbError    = '';

try {
  [tickets, total, components, customers, admins] = await Promise.all([
    listAdminTickets(filters),
    countAdminTickets(filters),
    listKnownComponents(BRAND),
    listAllCustomers(),
    listAdminUsers(),
  ]);
} catch (err) {
  console.error('[admin/tickets] DB error:', err);
  dbError = 'Datenbankfehler beim Laden der Tickets.';
}

const STATUS_LABEL: Record<string, string> = {
  triage: 'Triage', backlog: 'Backlog', in_progress: 'In Arbeit',
  in_review: 'Review', blocked: 'Blockiert', done: 'Fertig', archived: 'Archiviert',
};
const STATUS_CLS: Record<string, string> = {
  triage:      'bg-purple-900/40 text-purple-300 border-purple-800',
  backlog:     'bg-slate-900/40 text-slate-300 border-slate-700',
  in_progress: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  in_review:   'bg-blue-900/40 text-blue-300 border-blue-800',
  blocked:     'bg-red-900/40 text-red-300 border-red-800',
  done:        'bg-green-900/40 text-green-300 border-green-800',
  archived:    'bg-dark text-muted border-dark-lighter',
};
const TYPE_LABEL: Record<string, string> = {
  bug: '🐛 Bug', feature: '✨ Feature', task: '📋 Task', project: '📁 Projekt',
};
const PRIO_CLS: Record<string, string> = { hoch: 'text-red-400', mittel: 'text-yellow-400', niedrig: 'text-green-400' };
const PRIO_ICON: Record<string, string> = { hoch: '▲', mittel: '●', niedrig: '▼' };

function formatDate(d: Date | null | string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function buildLink(ov: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  const keep = { type: typeFilter, status: statusFilter, component: componentFilter,
                 assigneeId: assigneeFilter, customerId: customerFilter,
                 thesisTag: thesisFilter, tag: tagFilter, q: qFilter };
  const merged = { ...keep, ...ov };
  for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
  const qs = p.toString();
  return `/admin/tickets${qs ? '?' + qs : ''}`;
}

const SAVED_VIEWS: { label: string; href: string }[] = [
  { label: 'Alle offenen', href: '/admin/tickets?status=open' },
  { label: 'Meine offenen', href: `/admin/tickets?status=open&assigneeId=${admins.find(a => a.email === session.email)?.id ?? ''}` },
  { label: 'Triage',        href: '/admin/tickets?status=triage' },
  { label: 'In Review',     href: '/admin/tickets?status=in_review' },
  { label: 'Blockiert',     href: '/admin/tickets?status=blocked' },
  { label: 'Bugs',          href: '/admin/tickets?type=bug&status=open' },
  { label: 'Features',      href: '/admin/tickets?type=feature&status=open' },
  { label: 'Projekte',      href: '/admin/tickets?type=project&status=open' },
  { label: 'Thesis FA',     href: '/admin/tickets?thesisTag=FA' },
];
---

<AdminLayout title="Admin — Tickets">
  <section class="pt-10 pb-20 bg-dark min-h-screen">
    <div class="max-w-7xl mx-auto px-6">

      <div class="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-3xl font-bold text-light font-serif">Tickets</h1>
          <p class="text-muted mt-1">{total} {total === 1 ? 'Ticket' : 'Tickets'} (gefiltert)</p>
        </div>
        <button type="button" id="create-btn"
          class="px-4 py-2 bg-gold hover:bg-gold-light text-dark text-sm font-semibold rounded-lg transition-colors">
          + Neues Ticket
        </button>
      </div>

      {/* Saved-view chips */}
      <div class="flex flex-wrap gap-2 mb-6">
        {SAVED_VIEWS.map(v => (
          <a href={v.href}
            class="px-3 py-1 text-xs rounded-full bg-dark-light border border-dark-lighter text-muted hover:text-light hover:border-gold/40 transition-colors">
            {v.label}
          </a>
        ))}
      </div>

      {dbError && (
        <div class="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">
          {dbError}
        </div>
      )}

      {/* Filters */}
      <form method="get" action="/admin/tickets" class="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label class="block text-xs text-muted mb-1">Typ</label>
          <select name="type"
            class="px-3 py-1.5 bg-dark-light border border-dark-lighter text-sm text-light rounded-lg cursor-pointer">
            <option value="" selected={!typeFilter}>Alle Typen</option>
            <option value="bug"     selected={typeFilter === 'bug'}>🐛 Bug</option>
            <option value="feature" selected={typeFilter === 'feature'}>✨ Feature</option>
            <option value="task"    selected={typeFilter === 'task'}>📋 Task</option>
            <option value="project" selected={typeFilter === 'project'}>📁 Projekt</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-muted mb-1">Status</label>
          <select name="status"
            class="px-3 py-1.5 bg-dark-light border border-dark-lighter text-sm text-light rounded-lg cursor-pointer">
            <option value="open"        selected={statusFilter === 'open'}>Offen (alle aktiven)</option>
            <option value="all"         selected={statusFilter === 'all'}>Alle (auch fertig/archiv)</option>
            <option value="triage"      selected={statusFilter === 'triage'}>Triage</option>
            <option value="backlog"     selected={statusFilter === 'backlog'}>Backlog</option>
            <option value="in_progress" selected={statusFilter === 'in_progress'}>In Arbeit</option>
            <option value="in_review"   selected={statusFilter === 'in_review'}>Review</option>
            <option value="blocked"     selected={statusFilter === 'blocked'}>Blockiert</option>
            <option value="done"        selected={statusFilter === 'done'}>Fertig</option>
            <option value="archived"    selected={statusFilter === 'archived'}>Archiviert</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-muted mb-1">Komponente</label>
          <select name="component"
            class="px-3 py-1.5 bg-dark-light border border-dark-lighter text-sm text-light rounded-lg cursor-pointer">
            <option value="" selected={!componentFilter}>Alle</option>
            {components.map(c => <option value={c} selected={componentFilter === c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label class="block text-xs text-muted mb-1">Zuständig</label>
          <select name="assigneeId"
            class="px-3 py-1.5 bg-dark-light border border-dark-lighter text-sm text-light rounded-lg cursor-pointer">
            <option value="" selected={!assigneeFilter}>Alle</option>
            {admins.map(a => <option value={a.id} selected={assigneeFilter === a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label class="block text-xs text-muted mb-1">Kunde</label>
          <select name="customerId"
            class="px-3 py-1.5 bg-dark-light border border-dark-lighter text-sm text-light rounded-lg cursor-pointer">
            <option value="" selected={!customerFilter}>Alle</option>
            {customers.map(c => <option value={c.id} selected={customerFilter === c.id}>{c.name}</option>)}
          </select>
        </div>
        <div class="flex-1 min-w-[200px]">
          <label class="block text-xs text-muted mb-1">Suche</label>
          <input type="text" name="q" value={qFilter}
            placeholder="Titel, Ticket-ID, Reporter-E-Mail"
            class="w-full px-3 py-1.5 bg-dark-light border border-dark-lighter text-sm text-light rounded-lg" />
        </div>
        <button type="submit"
          class="px-4 py-1.5 bg-gold/20 text-gold rounded-lg text-sm hover:bg-gold/30 transition-colors">
          Filtern
        </button>
        <a href="/admin/tickets" class="px-3 py-1.5 text-sm text-muted hover:text-light">↺ Reset</a>
      </form>

      {/* Table */}
      <div class="bg-dark-light rounded-2xl border border-dark-lighter overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-dark-lighter">
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">ID</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Typ</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Titel</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Status</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Prio</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Zuständig</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Kunde</th>
              <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Fällig</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colspan="8" class="px-4 py-10 text-center text-muted text-sm">
                  Keine Tickets für diese Filterauswahl.
                </td>
              </tr>
            ) : tickets.map(t => (
              <tr class={`border-b border-dark-lighter/50 hover:bg-dark/30 transition-colors ${t.status === 'archived' ? 'opacity-50' : ''}`}>
                <td class="px-4 py-3 font-mono text-xs text-gold whitespace-nowrap align-top">
                  <a href={`/admin/tickets/${t.id}`} class="hover:underline">
                    {t.externalId ?? t.id.slice(0, 8)}
                  </a>
                </td>
                <td class="px-4 py-3 text-xs whitespace-nowrap align-top">
                  {TYPE_LABEL[t.type] ?? t.type}
                </td>
                <td class="px-4 py-3 align-top">
                  <a href={`/admin/tickets/${t.id}`} class="text-light hover:text-gold text-sm">{t.title}</a>
                  {t.tagNames.length > 0 && (
                    <div class="flex flex-wrap gap-1 mt-1">
                      {t.tagNames.map(tag => (
                        <a href={buildLink({ tag })}
                          class="text-[10px] px-1.5 py-0.5 rounded bg-dark border border-dark-lighter text-muted hover:text-light hover:border-gold/40">
                          {tag}
                        </a>
                      ))}
                    </div>
                  )}
                </td>
                <td class="px-4 py-3 align-top">
                  <span class={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_CLS[t.status] ?? ''}`}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </td>
                <td class={`px-4 py-3 text-sm whitespace-nowrap align-top ${PRIO_CLS[t.priority] ?? ''}`}>
                  {PRIO_ICON[t.priority]} {t.priority}
                </td>
                <td class="px-4 py-3 text-sm text-muted whitespace-nowrap align-top">{t.assigneeLabel ?? '—'}</td>
                <td class="px-4 py-3 text-sm text-muted whitespace-nowrap align-top">{t.customerLabel ?? '—'}</td>
                <td class="px-4 py-3 text-sm text-muted whitespace-nowrap align-top">{formatDate(t.dueDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  {/* Create dialog */}
  <dialog id="create-dialog"
    class="bg-dark-light border border-dark-lighter rounded-2xl p-6 w-full max-w-lg backdrop:bg-black/60">
    <h2 class="text-lg font-semibold text-light mb-4 font-serif">Neues Ticket</h2>
    <form id="create-form" class="space-y-4">
      <div>
        <label class="block text-xs text-muted mb-1">Typ <span class="text-red-400">*</span></label>
        <select name="type" required
          class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm">
          <option value="feature">✨ Feature</option>
          <option value="task">📋 Task</option>
          <option value="project">📁 Projekt</option>
        </select>
      </div>
      <div>
        <label class="block text-xs text-muted mb-1">Titel <span class="text-red-400">*</span></label>
        <input type="text" name="title" required maxlength="200"
          class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm" />
      </div>
      <div>
        <label class="block text-xs text-muted mb-1">Beschreibung</label>
        <textarea name="description" rows="3" maxlength="4000"
          class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm resize-none"></textarea>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-muted mb-1">Priorität</label>
          <select name="priority"
            class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm">
            <option value="hoch">▲ Hoch</option>
            <option value="mittel" selected>● Mittel</option>
            <option value="niedrig">▼ Niedrig</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-muted mb-1">Komponente</label>
          <input type="text" name="component" maxlength="100"
            class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-muted mb-1">Zuständig</label>
          <select name="assigneeId"
            class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm">
            <option value="">— niemand —</option>
            {admins.map(a => <option value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label class="block text-xs text-muted mb-1">Kunde</label>
          <select name="customerId"
            class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm">
            <option value="">— kein Kunde —</option>
            {customers.map(c => <option value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <p id="create-error" class="text-red-400 text-xs hidden"></p>
      <div class="flex gap-3 justify-end">
        <button type="button" id="create-cancel"
          class="px-4 py-2 text-sm text-muted hover:text-light transition-colors">Abbrechen</button>
        <button type="submit"
          class="px-4 py-2 text-sm bg-gold hover:bg-gold-light text-dark font-semibold rounded-lg transition-colors">
          Erstellen
        </button>
      </div>
    </form>
  </dialog>
</AdminLayout>

<script>
  const dialog = document.getElementById('create-dialog') as HTMLDialogElement;
  const form   = document.getElementById('create-form')   as HTMLFormElement;
  const error  = document.getElementById('create-error')  as HTMLParagraphElement;
  document.getElementById('create-btn')?.addEventListener('click', () => dialog.showModal());
  document.getElementById('create-cancel')?.addEventListener('click', () => dialog.close());
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.classList.add('hidden');
    const fd = new FormData(form);
    const body: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) if (v) body[k] = v;
    const r = await fetch('/api/admin/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({ error: 'Fehler' }));
      error.textContent = j.error ?? 'Fehler';
      error.classList.remove('hidden');
      return;
    }
    const j = await r.json() as { id: string };
    location.href = `/admin/tickets/${j.id}`;
  });
</script>
```

- [ ] **Step 2: Verify Astro/Svelte compiles.**

Run: `cd website && npx astro check 2>&1 | tail -40`
Expected: no errors related to this file.

- [ ] **Step 3: Commit.**

```bash
git add website/src/pages/admin/tickets.astro
git commit -m "feat(tickets): add admin tickets index page (PR4/5)"
```

---

## Task 11: Page — `/admin/tickets/[id]` detail

**Files:**
- Create: `website/src/pages/admin/tickets/[id].astro`

- [ ] **Step 1: Write the file.**

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../lib/auth';
import { getTicketDetail, getTicketTimeline } from '../../../lib/tickets/admin';
import TicketActivityTimeline from '../../../components/admin/TicketActivityTimeline.svelte';
import TicketActionBar from '../../../components/admin/TicketActionBar.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const BRAND = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const { id } = Astro.params;
if (!id) return Astro.redirect('/admin/tickets');

const [ticket, timeline] = await Promise.all([
  getTicketDetail(BRAND, id),
  getTicketTimeline(BRAND, id),
]);

if (!ticket) return Astro.redirect('/admin/tickets');

const STATUS_LABEL: Record<string, string> = {
  triage: 'Triage', backlog: 'Backlog', in_progress: 'In Arbeit',
  in_review: 'Review', blocked: 'Blockiert', done: 'Fertig', archived: 'Archiviert',
};
const STATUS_CLS: Record<string, string> = {
  triage:      'bg-purple-900/40 text-purple-300 border-purple-800',
  backlog:     'bg-slate-900/40 text-slate-300 border-slate-700',
  in_progress: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  in_review:   'bg-blue-900/40 text-blue-300 border-blue-800',
  blocked:     'bg-red-900/40 text-red-300 border-red-800',
  done:        'bg-green-900/40 text-green-300 border-green-800',
  archived:    'bg-dark text-muted border-dark-lighter',
};
const TYPE_LABEL: Record<string, string> = {
  bug: '🐛 Bug', feature: '✨ Feature', task: '📋 Task', project: '📁 Projekt',
};
const PRIO_CLS:  Record<string, string> = { hoch: 'text-red-400', mittel: 'text-yellow-400', niedrig: 'text-green-400' };
const PRIO_ICON: Record<string, string> = { hoch: '▲', mittel: '●', niedrig: '▼' };

function fmt(d: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE',
    { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDateTime(d: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('de-DE',
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
---

<AdminLayout title={`Admin — ${ticket.externalId ?? ticket.id.slice(0, 8)}: ${ticket.title}`}>
  <section class="pt-10 pb-20 bg-dark min-h-screen">
    <div class="max-w-6xl mx-auto px-6">

      {/* Breadcrumb */}
      <nav class="text-sm text-muted mb-4">
        <a href="/admin/tickets" class="hover:text-gold">Tickets</a>
        <span class="mx-2">/</span>
        <span class="font-mono text-gold">{ticket.externalId ?? ticket.id.slice(0, 8)}</span>
      </nav>

      {/* Header */}
      <div class="mb-6 flex items-start gap-4 flex-wrap">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-3 flex-wrap mb-2">
            <span class="text-xs px-2 py-1 rounded bg-dark-light border border-dark-lighter text-muted whitespace-nowrap">
              {TYPE_LABEL[ticket.type] ?? ticket.type}
            </span>
            <span class={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CLS[ticket.status] ?? ''}`}>
              {STATUS_LABEL[ticket.status] ?? ticket.status}
              {ticket.resolution && ` (${ticket.resolution})`}
            </span>
            <span class={`text-sm font-semibold ${PRIO_CLS[ticket.priority] ?? ''}`}>
              {PRIO_ICON[ticket.priority]} {ticket.priority}
            </span>
            {ticket.severity && (
              <span class="text-xs px-2 py-0.5 rounded bg-dark border border-dark-lighter text-muted">
                {ticket.severity}
              </span>
            )}
          </div>
          <h1 class="text-2xl font-bold text-light font-serif">{ticket.title}</h1>
          {ticket.tagNames.length > 0 && (
            <div class="flex flex-wrap gap-1 mt-2">
              {ticket.tagNames.map(tag => (
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-dark border border-dark-lighter text-muted">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action bar (Svelte island) */}
      <div class="mb-6">
        <TicketActionBar client:load ticketId={ticket.id} currentStatus={ticket.status} />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div class="lg:col-span-2 space-y-6">

          {/* Description */}
          <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
            <h2 class="text-sm font-semibold text-light mb-2 font-serif uppercase tracking-wide">Beschreibung</h2>
            {ticket.description ? (
              <p class="text-sm text-light/90 whitespace-pre-wrap">{ticket.description}</p>
            ) : (
              <p class="text-sm text-muted italic">Keine Beschreibung.</p>
            )}
            {ticket.url && (
              <p class="text-xs text-muted mt-3">
                URL: <a href={ticket.url} target="_blank" rel="noopener" class="text-gold hover:underline">{ticket.url}</a>
              </p>
            )}
          </div>

          {/* Children tree */}
          {ticket.children.length > 0 && (
            <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
              <h2 class="text-sm font-semibold text-light mb-3 font-serif uppercase tracking-wide">
                Kind-Tickets ({ticket.children.length})
              </h2>
              <ul class="space-y-2">
                {ticket.children.map(c => (
                  <li class="flex items-center gap-3 text-sm">
                    <span class="font-mono text-xs text-gold w-32 shrink-0">
                      {c.externalId ?? c.id.slice(0, 8)}
                    </span>
                    <a href={`/admin/tickets/${c.id}`} class="text-light hover:text-gold flex-1 truncate">
                      {c.title}
                    </a>
                    <span class={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_CLS[c.status] ?? ''}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Linked tickets */}
          {ticket.links.length > 0 && (
            <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
              <h2 class="text-sm font-semibold text-light mb-3 font-serif uppercase tracking-wide">
                Verknüpfungen ({ticket.links.length})
              </h2>
              <ul class="space-y-2">
                {ticket.links.map(l => (
                  <li class="flex items-center gap-3 text-sm">
                    <span class="text-xs text-muted w-32 shrink-0">
                      {l.direction === 'out' ? l.kind : `${l.kind} (← in)`}
                    </span>
                    <a href={`/admin/tickets/${l.otherId}`} class="text-light hover:text-gold flex-1 truncate">
                      {l.otherTitle}
                    </a>
                    {l.prNumber && (
                      <a href={`https://github.com/Paddione/Bachelorprojekt/pull/${l.prNumber}`}
                        target="_blank" rel="noopener"
                        class="text-xs text-gold/70 hover:text-gold font-mono">
                        PR #{l.prNumber}
                      </a>
                    )}
                    <button type="button"
                      class="unlink-btn text-xs text-red-400/60 hover:text-red-400 ml-2"
                      data-link-id={l.id}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Activity timeline */}
          <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
            <h2 class="text-sm font-semibold text-light mb-3 font-serif uppercase tracking-wide">Verlauf</h2>
            <TicketActivityTimeline client:load entries={timeline} />
          </div>

          {/* Attachments */}
          <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide">
                Anhänge ({ticket.attachments.length})
              </h2>
              <button type="button" id="upload-btn"
                class="px-3 py-1 text-xs bg-gold/20 text-gold border border-gold/30 rounded hover:bg-gold/30 transition-colors">
                + Datei
              </button>
            </div>
            {ticket.attachments.length === 0 ? (
              <p class="text-sm text-muted italic">Keine Anhänge.</p>
            ) : (
              <ul class="space-y-1 text-sm">
                {ticket.attachments.map(a => (
                  <li class="flex items-center gap-3">
                    <span class="text-light flex-1 truncate">{a.filename}</span>
                    <span class="text-xs text-muted">{a.mimeType}</span>
                    <span class="text-xs text-muted font-mono">
                      {a.fileSize ? (a.fileSize < 1024 ? `${a.fileSize} B` :
                                     a.fileSize < 1024 * 1024 ? `${(a.fileSize / 1024).toFixed(1)} KB` :
                                     `${(a.fileSize / 1024 / 1024).toFixed(1)} MB`) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside class="space-y-4">
          <div class="bg-dark-light rounded-2xl border border-dark-lighter p-5 text-sm">
            <dl class="space-y-3">
              <div>
                <dt class="text-xs text-muted uppercase tracking-wide mb-0.5">Erstellt</dt>
                <dd class="text-light">{fmtDateTime(ticket.createdAt)}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted uppercase tracking-wide mb-0.5">Aktualisiert</dt>
                <dd class="text-light">{fmtDateTime(ticket.updatedAt)}</dd>
              </div>
              {ticket.startDate && (
                <div>
                  <dt class="text-xs text-muted uppercase tracking-wide mb-0.5">Start</dt>
                  <dd class="text-light">{fmt(ticket.startDate)}</dd>
                </div>
              )}
              {ticket.dueDate && (
                <div>
                  <dt class="text-xs text-muted uppercase tracking-wide mb-0.5">Fällig</dt>
                  <dd class="text-light">{fmt(ticket.dueDate)}</dd>
                </div>
              )}
              {ticket.assigneeLabel && (
                <div>
                  <dt class="text-xs text-muted uppercase tracking-wide mb-0.5">Zuständig</dt>
                  <dd class="text-light">{ticket.assigneeLabel}</dd>
                </div>
              )}
              {ticket.customerLabel && (
                <div>
                  <dt class="text-xs text-muted uppercase tracking-wide mb-0.5">Kunde</dt>
                  <dd class="text-light">{ticket.customerLabel}</dd>
                </div>
              )}
              {ticket.reporterEmail && (
                <div>
                  <dt class="text-xs text-muted uppercase tracking-wide mb-0.5">Reporter</dt>
                  <dd class="text-light truncate">{ticket.reporterEmail}</dd>
                </div>
              )}
              {ticket.component && (
                <div>
                  <dt class="text-xs text-muted uppercase tracking-wide mb-0.5">Komponente</dt>
                  <dd class="text-light">{ticket.component}</dd>
                </div>
              )}
              {ticket.thesisTag && (
                <div>
                  <dt class="text-xs text-muted uppercase tracking-wide mb-0.5">Thesis-Tag</dt>
                  <dd class="text-light font-mono">{ticket.thesisTag}</dd>
                </div>
              )}
              {ticket.parentId && (
                <div>
                  <dt class="text-xs text-muted uppercase tracking-wide mb-0.5">Parent</dt>
                  <dd>
                    <a href={`/admin/tickets/${ticket.parentId}`} class="text-gold hover:underline">
                      Parent öffnen
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div class="bg-dark-light rounded-2xl border border-dark-lighter p-5 text-sm">
            <h3 class="text-xs text-muted uppercase tracking-wide mb-2">Watcher ({ticket.watchers.length})</h3>
            {ticket.watchers.length === 0 ? (
              <p class="text-muted italic text-xs">Keine Watcher.</p>
            ) : (
              <ul class="space-y-1">
                {ticket.watchers.map(w => <li class="text-light">{w.label}</li>)}
              </ul>
            )}
          </div>
        </aside>
      </div>

    </div>
  </section>

  {/* Upload dialog */}
  <dialog id="upload-dialog"
    class="bg-dark-light border border-dark-lighter rounded-2xl p-6 w-full max-w-md backdrop:bg-black/60">
    <h2 class="text-lg font-semibold text-light mb-4 font-serif">Datei anhängen</h2>
    <form id="upload-form" enctype="multipart/form-data" class="space-y-4">
      <div>
        <label class="block text-xs text-muted mb-1">Datei <span class="text-red-400">*</span></label>
        <input type="file" name="file" required
          class="w-full text-sm text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gold/20 file:text-gold hover:file:bg-gold/30 file:cursor-pointer cursor-pointer" />
        <p class="text-xs text-muted mt-1">Max. 5 MB</p>
      </div>
      <p id="upload-error" class="text-red-400 text-xs hidden"></p>
      <div class="flex gap-3 justify-end">
        <button type="button" id="upload-cancel"
          class="px-4 py-2 text-sm text-muted hover:text-light transition-colors">Abbrechen</button>
        <button type="submit"
          class="px-4 py-2 text-sm bg-gold hover:bg-gold-light text-dark font-semibold rounded-lg transition-colors">
          Hochladen
        </button>
      </div>
    </form>
  </dialog>
</AdminLayout>

<script define:vars={{ ticketId: ticket.id }}>
  const dlg = document.getElementById('upload-dialog');
  const form = document.getElementById('upload-form');
  const error = document.getElementById('upload-error');
  document.getElementById('upload-btn')?.addEventListener('click', () => dlg.showModal());
  document.getElementById('upload-cancel')?.addEventListener('click', () => dlg.close());
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.classList.add('hidden');
    const fd = new FormData(form);
    const r = await fetch(`/api/admin/tickets/${ticketId}/attachments`, { method: 'POST', body: fd });
    if (!r.ok) {
      const j = await r.json().catch(() => ({ error: 'Upload-Fehler' }));
      error.textContent = j.error ?? 'Upload-Fehler';
      error.classList.remove('hidden');
      return;
    }
    location.reload();
  });

  document.querySelectorAll('.unlink-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Verknüpfung entfernen?')) return;
      const linkId = btn.getAttribute('data-link-id');
      const r = await fetch(`/api/admin/tickets/${ticketId}/links?linkId=${linkId}`, { method: 'DELETE' });
      if (r.ok) location.reload();
      else alert('Fehler beim Entfernen.');
    });
  });
</script>
```

- [ ] **Step 2: Verify Astro/Svelte compiles.**

Run: `cd website && npx astro check 2>&1 | tail -40`
Expected: no errors related to this file.

- [ ] **Step 3: Commit.**

```bash
git add website/src/pages/admin/tickets/\[id\].astro
git commit -m "feat(tickets): add admin ticket detail page (PR4/5)"
```

---

## Task 12: Add nav link in `AdminLayout.astro`

**Why:** Without a sidebar entry, the new page is undiscoverable. Place "Tickets" between Projekte and Rechnungen under "Betrieb" — that's where work-tracking already lives.

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 1: Read the current "Betrieb" group to find the insertion point.**

Run: `grep -n "Projekte\|Rechnungen" website/src/layouts/AdminLayout.astro`

Expected: `'/admin/projekte'` line and `'/admin/rechnungen'` line about 3 lines apart (this plan was authored against `AdminLayout.astro:79-80`). Confirm the order before editing.

- [ ] **Step 2: Insert the new nav entry.**

In `website/src/layouts/AdminLayout.astro`, find:

```astro
      { href: '/admin/projekte',      label: 'Projekte',      icon: 'clipboard' },
      { href: '/admin/rechnungen',    label: 'Rechnungen',    icon: 'receipt' },
```

Replace with:

```astro
      { href: '/admin/projekte',      label: 'Projekte',      icon: 'clipboard' },
      { href: '/admin/tickets',       label: 'Tickets',       icon: 'tag' },
      { href: '/admin/rechnungen',    label: 'Rechnungen',    icon: 'receipt' },
```

The `tag` icon already exists in the `icons` map (`AdminLayout.astro:49`). Verify by running:

```bash
grep -c "  tag:" website/src/layouts/AdminLayout.astro
```

Expected output: `1`. If it's `0`, **stop and fix** — pick a different existing icon (`clipboard`, `inbox`, `bug`).

- [ ] **Step 3: Verify Astro compiles.**

Run: `cd website && npx astro check 2>&1 | tail -20`
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(tickets): add Tickets nav entry in admin sidebar (PR4/5)"
```

---

## Task 13: docs-site mention

**Why:** Spec PR4 calls for "Documentation update in docs-site". The existing `docs-site/index.html` is a single Docsify file; we add a short paragraph at the bottom of the existing markdown content describing the unified ticket view.

**Files:**
- Modify: `docs-site/index.html`

- [ ] **Step 1: Find a markdown anchor inside `docs-site/index.html` to append after.**

Run: `grep -n "## \|### " docs-site/index.html | tail -10`

Pick the last `## …` heading that's about admin/operations (likely near the end). The exact heading varies — append the new section after the existing content but before any closing `</textarea>` or `<script>` markers.

- [ ] **Step 2: Append the Tickets section.**

Locate the markdown content area and append (preserving existing indentation and surrounding text):

```markdown

## Tickets (Unified Inbox)

Alle Bug-Reports, Features, Aufgaben und Projekte laufen seit PR4 in einem
einzigen Modell unter `tickets.tickets`. Der Admin-Inbox-Eintrag ist
`/admin/tickets`. Filter:

- **Typ:** bug, feature, task, project
- **Status:** triage → backlog → in_progress → in_review → blocked → done → archived
- **Saved Views:** "Alle offenen", "Triage", "In Review", "Bugs", "Features", "Projekte", "Thesis FA"

Status-Übergänge gehen ausschließlich durch `transitionTicket()` —
das schickt automatisch die Reporter-Close-Mail bei `status='done'` für
Bug-Tickets mit `reporter_email`.

Die alten Seiten `/admin/bugs` und `/admin/projekte` bleiben als
gewohnte Listen-Ansichten erhalten und lesen aus demselben Modell.
```

- [ ] **Step 3: Deploy docs (no auto-sync).**

Per CLAUDE.md gotcha: docs ConfigMap is not auto-synced by ArgoCD. Document this for the executor; they'll deploy after PR-merge in Task 16. No verification needed in this task — file change suffices.

- [ ] **Step 4: Commit.**

```bash
git add docs-site/index.html
git commit -m "docs(tickets): add unified inbox section in docs-site (PR4/5)"
```

---

## Task 14: Playwright spec — `fa-admin-tickets.spec.ts`

**Why:** Spec PR4 §10 requires "new E2E spec for `/admin/tickets` filters, transitions, link creation, comment posting (public + internal)." Pattern source: `tests/e2e/specs/fa-bugs-notifications.spec.ts`.

**Files:**
- Create: `tests/e2e/specs/fa-admin-tickets.spec.ts`

- [ ] **Step 1: Read the existing pattern.**

Run: `head -50 tests/e2e/specs/fa-bugs-notifications.spec.ts`

Confirm: env vars `WEBSITE_URL`, `MAILPIT_URL`, `E2E_ADMIN_USER`, `E2E_ADMIN_PASS`. The new spec uses the same login flow.

- [ ] **Step 2: Write the file.**

```ts
// tests/e2e/specs/fa-admin-tickets.spec.ts
//
// PR4/5 — admin /admin/tickets coverage:
//   1. Filter the index page (status=open + type=bug)
//   2. Open a freshly minted bug ticket via /admin/tickets/:id
//   3. Add an internal comment (POST /api/admin/tickets/:id/comments)
//   4. Add a public comment → reporter receives an email (Mailpit)
//   5. Transition the ticket to done with resolution=fixed →
//      close-mail to reporter (Mailpit subject contains BR-ID)
//   6. Verify the activity timeline rendered each event
//
// The test skips gracefully when E2E_ADMIN_PASS is unset (CI without secrets).

import { test, expect } from '@playwright/test';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const MAILPIT    = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'patrick';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

interface MailpitAddress { Address: string }
interface MailpitMessage { Subject: string; To: MailpitAddress[]; ID: string }
interface MailpitSearchResult { messages: MailpitMessage[] }

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/api/auth/login?returnTo=/admin/tickets`);
  await page.waitForURL(/realms\/workspace/, { timeout: 20_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/tickets/, { timeout: 20_000 });
}

test.describe('FA-admin-tickets', () => {
  test('full flow: filter + comment + transition + timeline', async ({ page, request }) => {
    test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping');

    // ── 1. Mint a public bug as the seed ticket ──
    const reporter = `e2e-tickets-${Date.now()}@example.com`;
    const create = await request.post(`${BASE}/api/bug-report`, {
      multipart: {
        description: 'PR4 admin-tickets E2E seed',
        email:       reporter,
        category:    'fehler',
        url:         '/admin/tickets-e2e',
      },
    });
    expect(create.ok()).toBeTruthy();
    const cb = await create.json() as { success: boolean; ticketId: string };
    expect(cb.ticketId).toMatch(/^BR-/);
    const externalId = cb.ticketId;

    // ── 2. Admin login + index filter ──
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/tickets?type=bug&status=open&q=${externalId}`);
    const externalIdLink = page.locator(`a:has-text("${externalId}")`).first();
    await expect(externalIdLink).toBeVisible({ timeout: 10_000 });

    // ── 3. Open detail page ──
    await externalIdLink.click();
    await page.waitForURL(/\/admin\/tickets\/[0-9a-f-]+/, { timeout: 10_000 });
    const detailUrl = page.url();
    const ticketUuid = detailUrl.split('/').pop()!;
    expect(ticketUuid).toMatch(/^[0-9a-f-]{36}$/);

    // ── 4. Internal comment ──
    const internalRes = await page.request.post(
      `${BASE}/api/admin/tickets/${ticketUuid}/comments`,
      { headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ body: 'PR4 internal comment', visibility: 'internal' }) });
    expect(internalRes.ok()).toBeTruthy();

    // ── 5. Public comment → reporter mail ──
    const publicRes = await page.request.post(
      `${BASE}/api/admin/tickets/${ticketUuid}/comments`,
      { headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ body: 'PR4 public reply for the reporter', visibility: 'public' }) });
    expect(publicRes.ok()).toBeTruthy();
    await page.waitForTimeout(2000);
    const publicMail = await request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${reporter} subject:${externalId}`)}`);
    expect(publicMail.ok()).toBeTruthy();
    const publicData = await publicMail.json() as MailpitSearchResult;
    expect(publicData.messages.length).toBeGreaterThan(0);

    // ── 6. Transition to done → close-mail ──
    const transRes = await page.request.post(
      `${BASE}/api/admin/tickets/${ticketUuid}/transition`,
      { headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ status: 'done', resolution: 'fixed', note: 'PR4 done', noteVisibility: 'internal' }) });
    expect(transRes.ok()).toBeTruthy();
    await page.waitForTimeout(2000);
    const closeMail = await request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${reporter}`)}`);
    expect(closeMail.ok()).toBeTruthy();
    const closeData = await closeMail.json() as MailpitSearchResult;
    const closeMsg = closeData.messages.find(m =>
      m.Subject.includes(externalId) && m.Subject.includes('bearbeitet'));
    expect(closeMsg, `close-mail with subject containing ${externalId} not found`).toBeTruthy();

    // ── 7. Reload detail and assert the timeline rendered all events ──
    await page.goto(detailUrl);
    const timelineBody = page.locator('.ticket-timeline');
    await expect(timelineBody).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ticket-timeline-comment').first()).toBeVisible();
    // At minimum: created + 2 comments + 1 status change → 4 timeline rows.
    const rowCount = await page.locator('.ticket-timeline-row').count();
    expect(rowCount).toBeGreaterThanOrEqual(4);
  });

  test('GET /api/admin/tickets returns 403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/tickets`);
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/tickets/:id/transition returns 403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/tickets/00000000-0000-0000-0000-000000000000/transition`,
      { headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ status: 'done', resolution: 'fixed' }) });
    expect([401, 403]).toContain(res.status());
  });
});
```

- [ ] **Step 3: Run the spec locally against k3d (optional but recommended).**

Run: `cd tests/e2e && npx playwright test specs/fa-admin-tickets.spec.ts --reporter=line`
Expected: tests pass when `E2E_ADMIN_PASS` is set; skip otherwise. If you skip this step locally, the live deploy in Task 16 will run it.

- [ ] **Step 4: Commit.**

```bash
git add tests/e2e/specs/fa-admin-tickets.spec.ts
git commit -m "test(tickets): add Playwright E2E for admin tickets UI (PR4/5)"
```

---

## Task 15: Final verification — type-check + Astro check on the whole branch

**Why:** Catch any cross-file regression before opening the PR.

- [ ] **Step 1: Run TypeScript on the website.**

Run: `cd website && npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.

- [ ] **Step 2: Run Astro check.**

Run: `cd website && npx astro check 2>&1 | tail -40`
Expected: zero errors. Warnings about unrelated files are fine.

- [ ] **Step 3: Run the offline test suite.**

Run: `task test:all` (from repo root)
Expected: BATS unit + manifest + dry-run all pass. PR4 doesn't touch manifests, so this is a regression check only.

- [ ] **Step 4: If anything fails, fix locally before PR.** No need to commit until green.

---

## Task 16: Open PR + auto-merge + deploy

**Why:** Per kickoff convention — squash-merge on green CI, then `task feature:website` rolls both prod clusters.

- [ ] **Step 1: Push the feature branch.**

```bash
git push -u origin feature/tickets-pr4
```

- [ ] **Step 2: Open the PR.**

```bash
gh pr create \
  --title "feat(tickets): unified /admin/tickets UI + admin API (PR4/5)" \
  --body "$(cat <<'EOF'
## Summary

PR4 of the unified-ticketing migration (spec §9 PR4). Pure UI + API surface
over the `tickets.*` schema PR1/2/3 already created.

- New `/admin/tickets` index page with type/status/component/assignee/customer/tag/q
  filters, saved-view chips, and a Linear-style table.
- New `/admin/tickets/:id` detail page: header, action bar (transition,
  comment, link), child tree, linked tickets (with PR-merge events folded in),
  activity timeline, sidebar metadata, attachments.
- New API endpoints under `/api/admin/tickets/*` (list+create, get+patch,
  transition, comments, links, attachments). All brand-scoped via
  `process.env.BRAND_ID`.
- `transitionTicket()` (PR1) remains the single status writer — the new
  transition endpoint is a thin wrapper.
- `/admin/bugs` and `/admin/projekte` are untouched and still read from the
  same `tickets.*` schema (per kickoff hard-constraint #5).

## Test plan

- [ ] `task feature:website` after merge — both prod clusters roll
- [ ] Visit `web.mentolder.de/admin/tickets` and confirm only mentolder rows
- [ ] Visit `web.korczewski.de/admin/tickets` and confirm only korczewski rows
- [ ] Filter by type=bug, status=open — table populates
- [ ] Open a bug ticket detail page; verify timeline shows `created`
- [ ] Transition to `done` with resolution `fixed`; verify close-mail in Mailpit
- [ ] Add a public comment; verify second mail in Mailpit
- [ ] Add a `relates_to` link to another ticket; verify it shows in the timeline
- [ ] Old `/admin/bugs` and `/admin/projekte` pages still work
- [ ] `tests/e2e/specs/fa-admin-tickets.spec.ts` passes locally with
      `E2E_ADMIN_PASS` set against the live cluster

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch CI.**

Run: `gh pr checks --watch`
Expected: all green. If anything red, fix and push to the same branch (no `--amend` — new commit).

- [ ] **Step 4: Squash-merge.**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 5: Pull main + deploy website to both prod clusters.**

```bash
git checkout main
git pull
task feature:website
```

Expected: both `mentolder` and `korczewski` rolled. The `feature:website` task runs `task website:redeploy ENV=mentolder && task website:redeploy ENV=korczewski`.

- [ ] **Step 6: Deploy docs ConfigMap.**

```bash
task docs:deploy
```

Per CLAUDE.md gotcha: docs are NOT ArgoCD-synced. This step is required for the new docs-site section to appear at `docs.<domain>`.

- [ ] **Step 7: Live smoke test.**

In a browser:
1. `https://web.mentolder.de/admin/tickets` — sees only mentolder tickets
2. `https://web.korczewski.de/admin/tickets` — sees only korczewski tickets
3. `https://web.mentolder.de/admin/tickets?type=bug&status=open` — bug filter works
4. Open a bug detail; transition to done with resolution=fixed; check Mailpit
5. `https://web.mentolder.de/admin/bugs` and `/admin/projekte` still load

If any URL returns 500: tail logs with `task workspace:logs ENV=mentolder -- website` and fix forward.

- [ ] **Step 8: Run the live E2E spec.**

```bash
cd tests/e2e
WEBSITE_URL=https://web.mentolder.de \
MAILPIT_URL=https://mail.mentolder.de \
E2E_ADMIN_USER=patrick \
E2E_ADMIN_PASS="$(read -sp 'kc-pass: ' p && echo $p)" \
  npx playwright test specs/fa-admin-tickets.spec.ts --reporter=line
```

Expected: all assertions pass.

---

## Self-Review Checklist

- [x] Spec PR4 §9 each bullet has a task
  - "New `/admin/tickets` index page" → Task 10
  - "New `/admin/tickets/:id` detail page" → Task 11
  - New admin API endpoints → Tasks 2-7
  - `/admin/bugs`+`/admin/projekte` filter views — kept untouched per constraint #5 (saved-view chips link to filtered `/admin/tickets` instead, but the legacy pages remain)
  - "Unified inbox" — covered: the new `/admin/tickets` page IS the unified inbox; the existing inbox page already routes through `transitionTicket()` via `resolveBugTicket()` (no change needed in PR4)
  - Activity-timeline component → Task 8
  - Documentation update → Task 13
- [x] Spec PR4 §10 testing requirement → Task 14
- [x] Hard constraint #1 (no DB schema) — verified: no `tickets-db.ts` modification, no migration script
- [x] Hard constraint #2 (brand multi-tenancy) — every helper/endpoint takes `brand` and filters; brand-guard before mutation
- [x] Hard constraint #3 (`transitionTicket()` only writer) — Task 4's endpoint is a thin wrapper; PATCH endpoint explicitly rejects status/resolution
- [x] Hard constraint #4 (timeline reads `ticket_activity`) — `getTicketTimeline` reads `_created`/`_updated` rows from PR1's audit trigger; no new audit plumbing
- [x] Hard constraint #5 (`/admin/bugs` and `/admin/projekte` keep their UX) — neither file is in the modify list
- [x] No placeholders — every code step has full code; commands have expected output; commits use descriptive messages
- [x] Type consistency — `TicketStatus`, `TicketResolution`, `LinkKind` defined once in `admin.ts` (re-exported from `transition.ts` where they overlap; the literal sets are identical)
- [x] No new abstractions or speculative features — sticks to the spec; no v1.5 portal page, no watcher subscription UI, no Nextcloud-backed attachments
