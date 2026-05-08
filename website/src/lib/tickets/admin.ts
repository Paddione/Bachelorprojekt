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
  const push = (clause: string, v: unknown) => {
    vals.push(v);
    where.push(clause.replace(/\$N/g, `$${vals.length}`));
  };

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
  const push = (clause: string, v: unknown) => {
    vals.push(v);
    where.push(clause.replace(/\$N/g, `$${vals.length}`));
  };
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
         JOIN tickets.tickets ot ON ot.id = l.to_id AND ot.brand = $2
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
         JOIN tickets.tickets ot ON ot.id = l.from_id AND ot.brand = $2
         LEFT JOIN tickets.pr_events pe ON pe.pr_number = l.pr_number
        WHERE l.to_id = $1
        ORDER BY "createdAt" DESC`,
      [id, brand]
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
         JOIN tickets.tickets ot ON ot.id = l.to_id AND ot.brand = $2
         LEFT JOIN tickets.pr_events pe ON pe.pr_number = l.pr_number
        WHERE l.from_id = $1`, [id, brand]),
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
    const idIdx = vals.length;
    vals.push(p.brand);
    const brandIdx = vals.length;
    const r = await client.query(
      `UPDATE tickets.tickets SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${idIdx} AND brand = $${brandIdx}`, vals);
    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new Error('patchAdminTicket: ticket not found in brand');
    }
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
