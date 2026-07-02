// Types re-exported from config/types.ts for backward compatibility.
import type { ReferenzItem, ReferenzenConfig } from '../config/types';
export type { ReferenzItem, ReferenzenType, ReferenzenConfig } from '../config/types';

// ── T001490: Transitional type re-exports for the admin save endpoints ──────
//
// During the website-db-decouple migration the canonical content types
// moved to `website/src/content-schema`. To keep the call-sites compiling
// until Task 7 rewires every admin save endpoint, we re-export the new
// types under their old names here. These are type-only — zero runtime
// cost. Once Task 7 lands and all admin endpoints consume
// `publishContent` / `bundle*` getters, this block can be removed in a
// follow-up chore.
import type {
  HomepageContent, UebermichContent, FaqItem, KontaktContent,
  Stammdaten, NavItem, FooterConfig, KoreFlags,
  LeistungServiceRow, LeistungCategory, HomepageService,
  ServicePageContent, ServicePagePricing, ServicePageSection,
} from '../content-schema';
export type {
  HomepageContent, UebermichContent, FaqItem, KontaktContent,
  Stammdaten, NavItem, FooterConfig, KoreFlags,
  LeistungServiceRow, LeistungCategory, HomepageService,
  ServicePageContent, ServicePagePricing, ServicePageSection,
};

// Backwards-compat aliases — these are the pre-T001490 names for shapes
// that now live in `content-schema`. The admin save endpoints still
// import them by their old names; the alias keeps TS happy.
export type LeistungCategoryOverride = LeistungCategory;
export type LeistungServiceOverride = LeistungServiceRow;
export type ServiceOverride = HomepageService & {
  pageContent?: ServicePageContent;
  leistungCategoryId?: string;
  headlineKey?: string;
  headlinePrefix?: boolean;
};

// Meeting Knowledge Pipeline — PostgreSQL client.
// Writes meeting data, transcripts, and artifacts to the meetings DB.
// Uses the 'pg' npm package for direct database access.

import { initTicketsSchema } from './tickets-schema';
import { transitionTicket } from './tickets/transition';
import { refFor } from './content-registry';
import { idsToPrune } from './admin/version-prune';
import { isConflict as detectConflict, nextVersion as bumpVersion } from './admin/conflict';

// pool / ensureSchemaOnce / platformPool were moved to db-pool.ts (G-CQ07) so
// tickets modules can depend on the leaf-most pool without re-entering
// website-db. Re-export for backward compatibility with any external caller
// that imports these names from website-db.
import { pool, ensureSchemaOnce, __resetSchemaInitCacheForTests } from './db-pool';
export { pool, ensureSchemaOnce, __resetSchemaInitCacheForTests } from './db-pool';
export { platformPool } from './db-pool';
import type { Pool, PoolClient } from 'pg';

// listAllCustomers / listAdminUsers / getCustomerByEmail moved to
// project-portal-db.ts (G-SIZE03). Re-export for backward compatibility with
// any external caller that imports these names from website-db. Safe because
// project-portal-db.ts no longer imports anything from website-db.ts (both
// depend only on the neutral customer-types.ts leaf module).
export { listAllCustomers, listAdminUsers, getCustomerByEmail } from './project-portal-db';

// Eager boot-time init so tracker schema migrations apply on rollout rather
// than on the first lazy code path that happens to call initTicketsSchema (T000410).
// Non-blocking fire-and-forget: ensureSchemaOnce caches the promise and retries
// on the next access if the DB is not yet ready at startup.
initTicketsSchema().catch(() => { /* retried on first access via ensureSchemaOnce */ });

// ── Timeline (PR5: reads from tickets.pr_events on the same DB) ─────────────
// Historical note: an earlier implementation used a separate tracking pool
// against bachelorprojekt.v_timeline. That view + its source tables were
// sunset in PR5; we now read PR activity from tickets.pr_events on `pool`.

export type TimelineRow = {
  id: number;
  day: string;
  pr_number: number | null;
  title: string;
  description: string | null;
  category: string;
  scope: string | null;
  brand: string | null;
  requirement_id: string | null;
  requirement_name: string | null;
  bugs_fixed: number;
  ticket_external_id: string | null;
  ticket_id: string | null;
};

export async function listTimeline(opts: {
  limit?: number;
  offset?: number;
  category?: string;
  brand?: string;
} = {}): Promise<TimelineRow[]> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;

  // Read from tickets.pr_events (the unified ticketing source of truth).
  // PR5 migration: bachelorprojekt.v_timeline + features/requirements tables
  // are sunset; tickets.pr_events carries all PR activity going forward.
  // Requirement linkage no longer applies (no rows of type='requirement' exist
  // in tickets.tickets), so requirement_id/_name are NULL here.
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.category) { params.push(opts.category); where.push(`category = $${params.length}`); }
  if (opts.brand)    { params.push(opts.brand);    where.push(`(brand = $${params.length} OR brand IS NULL)`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit, offset);

  const rows = (await pool.query(
    `SELECT pr_number AS id,
            to_char(merged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
            pr_number, title, description,
            category, scope, brand,
            NULL::text AS requirement_id,
            NULL::text AS requirement_name
       FROM tickets.pr_events
       ${whereSql}
      ORDER BY merged_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )).rows as Omit<TimelineRow, 'bugs_fixed' | 'ticket_external_id' | 'ticket_id'>[];

  const prNumbers = rows.map(r => r.pr_number).filter((n): n is number => n != null);
  const bugCounts = new Map<number, number>();
  const ticketIds = new Map<number, { external_id: string; ticket_id: string }>();

  if (prNumbers.length > 0) {
    const [counts, links] = await Promise.all([
      pool.query<{ pr: number; n: number }>(
        `SELECT pr_number AS pr, COUNT(*)::int AS n
           FROM tickets.ticket_links
          WHERE kind = 'fixes' AND pr_number = ANY($1::int[])
          GROUP BY pr_number`,
        [prNumbers],
      ),
      pool.query<{ pr: number; external_id: string; ticket_id: string }>(
        `SELECT tl.pr_number AS pr, t.external_id, tl.from_id AS ticket_id
           FROM tickets.ticket_links tl
           JOIN tickets.tickets t ON t.id = tl.from_id
          WHERE tl.kind = 'implements' AND tl.pr_number = ANY($1::int[])`,
        [prNumbers],
      ),
    ]);
    for (const c of counts.rows) bugCounts.set(c.pr, c.n);
    for (const l of links.rows) ticketIds.set(l.pr, l);
  }

  return rows.map(r => ({
    ...r,
    bugs_fixed: r.pr_number ? (bugCounts.get(r.pr_number) ?? 0) : 0,
    ticket_external_id: r.pr_number ? (ticketIds.get(r.pr_number)?.external_id ?? null) : null,
    ticket_id: r.pr_number ? (ticketIds.get(r.pr_number)?.ticket_id ?? null) : null,
  }));
}

// ── Customer ────────────────────────────────────────────────────────────────

// Type moved to customer-types.ts (neutral leaf module) to avoid a
// website-db.ts <-> project-portal-db.ts import cycle (S2 quality gate).
// Re-exported here for backward compatibility with existing callers.
import type { Customer } from './customer-types';
export type { Customer } from './customer-types';

export async function upsertCustomer(params: {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  keycloakUserId?: string;
}): Promise<Customer> {
  const result = await pool.query(
    `INSERT INTO customers (name, email, phone, company, keycloak_user_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       phone = COALESCE(EXCLUDED.phone, customers.phone),
       company = COALESCE(EXCLUDED.company, customers.company),
       keycloak_user_id = COALESCE(EXCLUDED.keycloak_user_id, customers.keycloak_user_id),
       enrollment_declined = false,
       updated_at = now()
     RETURNING id, name, email, customer_number`,
    [params.name, params.email, params.phone, params.company,
     params.keycloakUserId]
  );
  return result.rows[0];
}

export interface PendingEnrollment {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  created_at: string;
}

export async function listPendingEnrollments(): Promise<PendingEnrollment[]> {
  const result = await pool.query(
    `SELECT id, name, email, phone, company, created_at
     FROM customers
     WHERE keycloak_user_id IS NULL AND enrollment_declined = false
     ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function declineEnrollment(id: string): Promise<void> {
  await pool.query(
    'UPDATE customers SET enrollment_declined = true WHERE id = $1',
    [id]
  );
}

export async function getCustomerFullById(id: string): Promise<{
  id: string; name: string; email: string; phone?: string; company?: string;
  customer_number?: string; admin_number?: string; is_admin?: boolean;
} | null> {
  const result = await pool.query(
    `SELECT id, name, email, phone, company, customer_number, admin_number, is_admin FROM customers WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getCustomerByKeycloakId(
  keycloakSub: string,
): Promise<{ id: string; email: string; name: string } | null> {
  const { rows } = await pool.query<{ id: string; email: string; name: string }>(
    `SELECT id, email, name FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakSub],
  );
  return rows[0] ?? null;
}

export async function setCustomerNumber(
  customerId: string,
  customerNumber: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (customerNumber !== null && !/^M\d{4}$/.test(customerNumber)) {
    return { ok: false, error: 'Ungültiges Format. Erwartet: M0020–M9999' };
  }
  if (customerNumber !== null) {
    const dup = await pool.query(
      'SELECT id FROM customers WHERE customer_number = $1 AND id != $2',
      [customerNumber, customerId]
    );
    if (dup.rows.length > 0) {
      return { ok: false, error: `${customerNumber} ist bereits vergeben.` };
    }
  }
  await pool.query(
    'UPDATE customers SET customer_number = $1 WHERE id = $2',
    [customerNumber, customerId]
  );
  return { ok: true };
}

export async function setAdminNumber(
  customerId: string,
  adminNumber: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (adminNumber !== null && !/^A\d{4}$/.test(adminNumber)) {
    return { ok: false, error: 'Ungültiges Format. Erwartet: A0001–A9999' };
  }
  if (adminNumber !== null) {
    const dup = await pool.query(
      'SELECT id FROM customers WHERE admin_number = $1 AND id != $2',
      [adminNumber, customerId]
    );
    if (dup.rows.length > 0) {
      return { ok: false, error: `${adminNumber} ist bereits vergeben.` };
    }
  }
  await pool.query(
    'UPDATE customers SET admin_number = $1 WHERE id = $2',
    [adminNumber, customerId]
  );
  return { ok: true };
}

export async function setIsAdmin(customerId: string, isAdmin: boolean): Promise<void> {
  await pool.query('UPDATE customers SET is_admin = $1 WHERE id = $2', [isAdmin, customerId]);
}

// Meetings domain extracted to meetings-db.ts (G-SIZE03)
// Temporary re-exports — will be removed after all callers update imports.
export {
  initMeetingsDb,
  getMeetingByRoomToken,
  createMeeting,
  updateMeetingStatus,
  saveTranscript,
  saveArtifact,
  saveInsight,
  releaseMeeting,
  getMeetingsForClient,
  listAllMeetings,
  getMeetingDetail,
} from './meetings-db';
export type {
  Meeting,
  MeetingWithDetails,
  MeetingWithCustomer,
  SavedTranscript,
  AdminMeeting,
} from './meetings-db';

export async function assignMeeting(meetingId: string, params: {
  customerName?: string;
  customerEmail?: string;
  meetingType?: string;
  projectId?: string | null;
}): Promise<void> {
  if (params.customerName && params.customerEmail) {
    const c = await upsertCustomer({ name: params.customerName, email: params.customerEmail });
    await pool.query(`UPDATE meetings SET customer_id = $2, updated_at = now() WHERE id = $1`, [meetingId, c.id]);
  }
  if (params.meetingType !== undefined) {
    await pool.query(`UPDATE meetings SET meeting_type = $2, updated_at = now() WHERE id = $1`, [meetingId, params.meetingType]);
  }
  if (params.projectId !== undefined) {
    await pool.query(`UPDATE meetings SET project_id = $2, updated_at = now() WHERE id = $1`, [meetingId, params.projectId]);
  }
}

// ── Bug Tickets ──────────────────────────────────────────────────────────────

export async function insertBugTicket(params: {
  category: string;
  reporterEmail: string;
  description: string;
  url?: string;
  brand: string;
  screenshots?: string[];
  isTestData?: boolean;
}): Promise<{ id: string; ticketId: string } | null> {
  await initTicketsSchema();
  const { rows } = await pool.query<{ id: string; external_id: string }>(
    `INSERT INTO tickets.tickets
       (type, brand, title, description, url, reporter_email, status, is_test_data)
     VALUES ('bug', $1, $2, $3, $4, $5, 'triage', $6)
     RETURNING id, external_id`,
    [params.brand,
     params.description.slice(0, 200),
     params.description, params.url ?? null, params.reporterEmail,
     params.isTestData ?? false]
  );
  if (rows.length === 0) return null;
  const newId = rows[0].id;
  const newExtId = rows[0].external_id;

  // Categorize as tag (kind:fehler|verbesserung|erweiterungswunsch)
  const tagName = `kind:${params.category}`;
  await pool.query(
    `INSERT INTO tickets.tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
    [tagName]);
  await pool.query(
    `INSERT INTO tickets.ticket_tags (ticket_id, tag_id)
     SELECT $1, id FROM tickets.tags WHERE name = $2 ON CONFLICT DO NOTHING`,
    [newId, tagName]);

  // Inline screenshots — kept as data_url for back-compat with existing form behavior
  for (const [idx, dataUrl] of (params.screenshots ?? []).entries()) {
    const m = dataUrl.match(/^data:([^;]+);/);
    await pool.query(
      `INSERT INTO tickets.ticket_attachments (ticket_id, filename, data_url, mime_type)
       VALUES ($1, $2, $3, $4)`,
      [newId, `screenshot-${idx + 1}`, dataUrl, m ? m[1] : 'application/octet-stream']);
  }
  return { id: newId, ticketId: newExtId };
}

async function ticketIdByExternal(externalId: string): Promise<string | null> {
  const r = await pool.query(
    `SELECT id FROM tickets.tickets WHERE type = 'bug' AND external_id = $1`,
    [externalId]);
  return r.rows[0]?.id ?? null;
}

export async function resolveBugTicket(
  ticketId: string,
  resolutionNote: string,
  actor: { id?: string; label: string } = { label: 'admin' }
): Promise<void> {
  const id = await ticketIdByExternal(ticketId);
  if (!id) throw new Error(`bug ${ticketId} not found`);
  await transitionTicket(id, {
    status: 'done', resolution: 'fixed',
    note: resolutionNote, noteVisibility: 'public',
    actor,
  });
}

export async function archiveBugTicket(
  ticketId: string,
  actor: { id?: string; label: string } = { label: 'admin' }
): Promise<void> {
  const id = await ticketIdByExternal(ticketId);
  if (!id) return;
  await transitionTicket(id, {
    status: 'archived', resolution: 'obsolete', actor,
  });
}

export interface BugTicketStatus {
  ticketId: string;
  status: 'open' | 'resolved' | 'archived';
  category: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

export async function getBugTicketStatus(ticketId: string): Promise<BugTicketStatus | null> {
  await initTicketsSchema();
  const r = await pool.query(
    `SELECT t.external_id AS "ticketId",
            CASE t.status WHEN 'done' THEN 'resolved'
                          WHEN 'archived' THEN 'archived' ELSE 'open' END AS status,
            (SELECT SPLIT_PART(g.name, ':', 2)
               FROM tickets.ticket_tags tt JOIN tickets.tags g ON g.id = tt.tag_id
              WHERE tt.ticket_id = t.id AND g.name LIKE 'kind:%' LIMIT 1) AS category,
            t.created_at AS "createdAt",
            t.done_at AS "resolvedAt",
            NULL AS "resolutionNote",
            (SELECT pr_number FROM tickets.ticket_links
              WHERE from_id = t.id AND kind = 'fixes' AND pr_number IS NOT NULL
              ORDER BY created_at DESC LIMIT 1) AS "fixedInPr",
            (SELECT created_at FROM tickets.ticket_links
              WHERE from_id = t.id AND kind = 'fixes' AND pr_number IS NOT NULL
              ORDER BY created_at DESC LIMIT 1) AS "fixedAt"
       FROM tickets.tickets t
      WHERE t.type = 'bug' AND t.external_id = $1`,
    [ticketId]);
  return r.rows[0] ?? null;
}

// ── Bug Ticket Comments ──────────────────────────────────────────────────────

export interface BugTicketRow {
  ticketId: string;
  category: string;
  reporterEmail: string;
  description: string;
  url: string | null;
  brand: string;
  status: 'open' | 'resolved' | 'archived';
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  screenshots: string[] | null;
  fixedInPr?: number | null;
  fixedAt?: Date | null;
}

export interface BugTicketComment {
  id: number;
  ticketId: string;
  author: string;
  kind: 'comment' | 'status_change' | 'system';
  body: string;
  createdAt: Date;
}

export async function getBugTicketWithComments(
  ticketId: string
): Promise<{ ticket: BugTicketRow; comments: BugTicketComment[] } | null> {
  await initTicketsSchema();
  const t = await pool.query(
    `SELECT t.external_id   AS "ticketId",
            COALESCE((SELECT SPLIT_PART(g.name, ':', 2)
                        FROM tickets.ticket_tags tt JOIN tickets.tags g ON g.id = tt.tag_id
                       WHERE tt.ticket_id = t.id AND g.name LIKE 'kind:%' LIMIT 1), '') AS category,
            t.reporter_email AS "reporterEmail",
            t.description,
            t.url,
            t.brand,
            CASE t.status WHEN 'done' THEN 'resolved'
                          WHEN 'archived' THEN 'archived' ELSE 'open' END AS status,
            t.created_at    AS "createdAt",
            t.done_at       AS "resolvedAt",
            NULL            AS "resolutionNote",
            (SELECT json_agg(data_url ORDER BY uploaded_at)
               FROM tickets.ticket_attachments WHERE ticket_id = t.id) AS "screenshots",
            (SELECT pr_number FROM tickets.ticket_links
               WHERE from_id = t.id AND kind = 'fixes' AND pr_number IS NOT NULL
               ORDER BY created_at DESC LIMIT 1) AS "fixedInPr",
            (SELECT created_at FROM tickets.ticket_links
               WHERE from_id = t.id AND kind = 'fixes' AND pr_number IS NOT NULL
               ORDER BY created_at DESC LIMIT 1) AS "fixedAt"
       FROM tickets.tickets t
      WHERE t.type = 'bug' AND t.external_id = $1`,
    [ticketId]);
  if (t.rows.length === 0) return null;
  const c = await pool.query(
    `SELECT tc.id,
            $1::text AS "ticketId",
            tc.author_label AS author,
            tc.kind,
            tc.body,
            tc.created_at AS "createdAt"
       FROM tickets.ticket_comments tc
       JOIN tickets.tickets t ON t.id = tc.ticket_id
      WHERE t.type = 'bug' AND t.external_id = $1
      ORDER BY tc.created_at ASC`,
    [ticketId]);
  return { ticket: t.rows[0], comments: c.rows };
}

export async function appendBugTicketComment(params: {
  ticketId: string;
  author: string;
  body: string;
  kind?: 'comment' | 'status_change' | 'system';
}): Promise<BugTicketComment> {
  await initTicketsSchema();
  const r = await pool.query(
    `INSERT INTO tickets.ticket_comments
       (ticket_id, author_label, kind, body, visibility)
     SELECT id, $2, $3, $4, 'internal' FROM tickets.tickets
      WHERE type = 'bug' AND external_id = $1
     RETURNING id, $1::text AS "ticketId", author_label AS author, kind, body, created_at AS "createdAt"`,
    [params.ticketId, params.author, params.kind ?? 'comment', params.body]);
  return r.rows[0];
}

export async function reopenBugTicket(
  ticketId: string,
  author: string,
  reason?: string
): Promise<void> {
  const id = await ticketIdByExternal(ticketId);
  if (!id) throw new Error(`ticket ${ticketId} not found`);
  await transitionTicket(id, {
    status: 'backlog',
    note: reason,
    actor: { label: author },
  });
}

// ── Site Settings (key/value store per brand) ────────────────────────────────
//
// Generic key-value store used by the admin app for vacation periods,
// e-mail settings, backup, etc. Content keys (NAV_KEY, FOOTER_KEY, …,
// seo_title_*, seo_meta_desc_*, seo_og_image_*) have been retired in
// T001490 — the public surface now reads from the content bundle.
export async function initSiteSettingsTable(): Promise<void> {
  return ensureSchemaOnce('site_settings', async () => {
    // Transaction-scoped advisory lock serialises concurrent processes/replicas
    // racing the same DDL on a cold DB. The lock auto-releases at COMMIT/ROLLBACK.
    await pool.query(`
      BEGIN;
      SELECT pg_advisory_xact_lock(hashtext('init:site_settings'));
      CREATE TABLE IF NOT EXISTS site_settings (
        brand      TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        key        TEXT,
        value      TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (brand, key)
      );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_brand_fkey') THEN
          ALTER TABLE site_settings ADD CONSTRAINT site_settings_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
      COMMIT;
    `);
  });
}

export async function getSiteSetting(brand: string, key: string): Promise<string | null> {
  await initSiteSettingsTable();
  const result = await pool.query(
    'SELECT value FROM site_settings WHERE brand = $1 AND key = $2',
    [brand, key]
  );
  return result.rows[0]?.value ?? null;
}

export async function setSiteSetting(brand: string, key: string, value: string): Promise<void> {
  await initSiteSettingsTable();
  await pool.query(
    `INSERT INTO site_settings (brand, key, value, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (brand, key) DO UPDATE SET value = $3, updated_at = now()`,
    [brand, key, value]
  );
}


let timeEntriesReady = false;

export interface TimeEntry {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskName: string | null;
  description: string | null;
  minutes: number;
  billable: boolean;
  rateCents: number;
  leistungKey: string | null;
  stripeInvoiceId: string | null;
  entryDate: Date;
  createdAt: Date;
}

async function initTimeEntriesTable(): Promise<void> {
  if (timeEntriesReady) return;
  await initTicketsSchema();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id        UUID        NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      task_id           UUID        REFERENCES tickets.tickets(id) ON DELETE SET NULL,
      description       TEXT,
      minutes           INTEGER     NOT NULL CHECK (minutes > 0),
      billable          BOOLEAN     NOT NULL DEFAULT true,
      rate_cents        INTEGER     NOT NULL DEFAULT 0,
      stripe_invoice_id TEXT,
      entry_date        DATE        NOT NULL DEFAULT CURRENT_DATE,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS time_entries_project_id_idx ON time_entries(project_id)
  `);
  await pool.query(`
    ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS rate_cents        INTEGER DEFAULT 0
  `);
  await pool.query(`
    ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT
  `);
  await pool.query(`
    ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS leistung_key TEXT
  `);
  timeEntriesReady = true;
}

export async function getLastTimeEntryRate(): Promise<number> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `SELECT rate_cents FROM time_entries ORDER BY created_at DESC LIMIT 1`
  );
  return result.rows[0]?.rate_cents ?? 0;
}

export async function createTimeEntry(params: {
  projectId: string;
  taskId?: string;
  description?: string;
  minutes: number;
  billable?: boolean;
  rateCents?: number;
  leistungKey?: string;
  entryDate?: string;
}): Promise<TimeEntry> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `INSERT INTO time_entries (project_id, task_id, description, minutes, billable, rate_cents, leistung_key, entry_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE))
     RETURNING
       id,
       project_id        AS "projectId",
       NULL::text        AS "projectName",
       task_id           AS "taskId",
       NULL::text        AS "taskName",
       description,
       minutes,
       billable,
       rate_cents        AS "rateCents",
       leistung_key      AS "leistungKey",
       stripe_invoice_id AS "stripeInvoiceId",
       entry_date        AS "entryDate",
       created_at        AS "createdAt"`,
    [
      params.projectId,
      params.taskId ?? null,
      params.description ?? null,
      params.minutes,
      params.billable ?? true,
      params.rateCents ?? 0,
      params.leistungKey ?? null,
      params.entryDate ?? null,
    ]
  );
  return result.rows[0] as TimeEntry;
}

export async function listTimeEntries(projectId: string): Promise<TimeEntry[]> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `SELECT te.id,
            te.project_id        AS "projectId",
            p.title              AS "projectName",
            te.task_id           AS "taskId",
            task.title           AS "taskName",
            te.description,
            te.minutes,
            te.billable,
            te.rate_cents        AS "rateCents",
            te.stripe_invoice_id AS "stripeInvoiceId",
            te.leistung_key      AS "leistungKey",
            te.entry_date        AS "entryDate",
            te.created_at        AS "createdAt"
     FROM time_entries te
     JOIN tickets.tickets p    ON p.id  = te.project_id
     LEFT JOIN tickets.tickets task ON task.id = te.task_id
     WHERE te.project_id = $1
     ORDER BY te.entry_date DESC`,
    [projectId]
  );
  return result.rows;
}

export async function listAllTimeEntries(params?: {
  billable?: boolean;
  since?: string;
}): Promise<TimeEntry[]> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `SELECT te.id,
            te.project_id        AS "projectId",
            p.title              AS "projectName",
            te.task_id           AS "taskId",
            task.title           AS "taskName",
            te.description,
            te.minutes,
            te.billable,
            te.rate_cents        AS "rateCents",
            te.stripe_invoice_id AS "stripeInvoiceId",
            te.leistung_key      AS "leistungKey",
            te.entry_date        AS "entryDate",
            te.created_at        AS "createdAt"
     FROM time_entries te
     JOIN tickets.tickets p    ON p.id  = te.project_id
     LEFT JOIN tickets.tickets task ON task.id = te.task_id
     WHERE ($1::boolean IS NULL OR te.billable = $1)
       AND ($2::date    IS NULL OR te.entry_date >= $2::date)
     ORDER BY te.entry_date DESC`,
    [params?.billable ?? null, params?.since ?? null]
  );
  return result.rows;
}

export async function setTimeEntryStripeInvoice(
  ids: string[],
  stripeInvoiceId: string | null
): Promise<void> {
  if (ids.length === 0) return;
  await initTimeEntriesTable();
  await pool.query(
    `UPDATE time_entries SET stripe_invoice_id = $1 WHERE id = ANY($2::uuid[])`,
    [stripeInvoiceId, ids]
  );
}

export async function getTimeEntryIdsByInvoice(stripeInvoiceId: string): Promise<string[]> {
  await initTimeEntriesTable();
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM time_entries WHERE stripe_invoice_id = $1`,
    [stripeInvoiceId]
  );
  return result.rows.map(r => r.id);
}

export interface UnbilledCustomerGroup {
  customerId: string;
  customerName: string;
  customerEmail: string;
  entries: Array<{
    id: string;
    projectId: string;
    projectName: string;
    description: string | null;
    minutes: number;
    rateCents: number;
    entryDate: Date;
  }>;
}

export async function getUnbilledBillableEntriesByCustomer(
  year: number,
  month: number  // 1-12
): Promise<UnbilledCustomerGroup[]> {
  await initTimeEntriesTable();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate   = new Date(year, month, 0).toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT te.id,
            te.project_id        AS "projectId",
            p.title              AS "projectName",
            te.description,
            te.minutes,
            te.rate_cents        AS "rateCents",
            te.entry_date        AS "entryDate",
            c.id                 AS "customerId",
            c.name               AS "customerName",
            c.email              AS "customerEmail"
     FROM time_entries te
     JOIN tickets.tickets p ON p.id = te.project_id
     JOIN customers c ON c.id = p.customer_id
     WHERE te.billable = true
       AND te.stripe_invoice_id IS NULL
       AND te.entry_date BETWEEN $1 AND $2
       AND p.customer_id IS NOT NULL`,
    [startDate, endDate]
  );

  const byCustomer = new Map<string, UnbilledCustomerGroup>();
  for (const row of result.rows) {
    if (!byCustomer.has(row.customerId)) {
      byCustomer.set(row.customerId, {
        customerId: row.customerId,
        customerName: row.customerName,
        customerEmail: row.customerEmail,
        entries: [],
      });
    }
    byCustomer.get(row.customerId)!.entries.push({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      description: row.description,
      minutes: row.minutes,
      rateCents: row.rateCents,
      entryDate: row.entryDate,
    });
  }
  return [...byCustomer.values()];
}

export async function deleteTimeEntry(id: string): Promise<void> {
  await initTimeEntriesTable();
  await pool.query('DELETE FROM time_entries WHERE id = $1', [id]);
}

export async function getProjectTotalMinutes(
  projectId: string
): Promise<{ total: number; billable: number }> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(minutes), 0)::int                                          AS total,
       COALESCE(SUM(CASE WHEN billable THEN minutes ELSE 0 END), 0)::int       AS billable
     FROM time_entries
     WHERE project_id = $1`,
    [projectId]
  );
  return result.rows[0];
}

// ── Client Notes ──────────────────────────────────────────────────────────────

export interface ClientNote {
  id: string;
  keycloakUserId: string;
  content: string;
  createdAt: Date;
}

async function initClientNotesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_notes (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id  TEXT        NOT NULL,
      content           TEXT        NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS client_notes_keycloak_user_id_idx ON client_notes(keycloak_user_id)
  `);
}

export async function listClientNotes(keycloakUserId: string): Promise<ClientNote[]> {
  await initClientNotesTable();
  const result = await pool.query(
    `SELECT id,
            keycloak_user_id AS "keycloakUserId",
            content,
            created_at       AS "createdAt"
     FROM client_notes
     WHERE keycloak_user_id = $1
     ORDER BY created_at DESC`,
    [keycloakUserId]
  );
  return result.rows;
}

export async function createClientNote(keycloakUserId: string, content: string): Promise<ClientNote> {
  await initClientNotesTable();
  const result = await pool.query(
    `INSERT INTO client_notes (keycloak_user_id, content)
     VALUES ($1, $2)
     RETURNING id,
               keycloak_user_id AS "keycloakUserId",
               content,
               created_at       AS "createdAt"`,
    [keycloakUserId, content]
  );
  return result.rows[0];
}

export async function deleteClientNote(id: string): Promise<void> {
  await pool.query('DELETE FROM client_notes WHERE id = $1', [id]);
}

// ── Onboarding-Checkliste ─────────────────────────────────────────────────────

export interface OnboardingItem {
  id: string;
  keycloakUserId: string;
  label: string;
  done: boolean;
  sortOrder: number;
}

const DEFAULT_ONBOARDING_ITEMS = [
  'Erstgespräch gebucht',
  'Vertrag unterzeichnet',
  'Nextcloud-Ordner erstellt',
  'Mattermost-Kanal eingerichtet',
  'Rechnungsadresse erfasst',
  'Zugangsdaten versendet',
];

async function initOnboardingTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS onboarding_items (
      id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id  TEXT    NOT NULL,
      label             TEXT    NOT NULL,
      done              BOOLEAN NOT NULL DEFAULT false,
      sort_order        INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS onboarding_items_keycloak_user_id_idx ON onboarding_items(keycloak_user_id)
  `);
}

export async function getOrCreateOnboardingChecklist(keycloakUserId: string): Promise<OnboardingItem[]> {
  await initOnboardingTable();
  const existing = await pool.query(
    `SELECT id, keycloak_user_id AS "keycloakUserId", label, done, sort_order AS "sortOrder"
     FROM onboarding_items
     WHERE keycloak_user_id = $1
     ORDER BY sort_order ASC`,
    [keycloakUserId]
  );
  if (existing.rows.length > 0) return existing.rows;

  // Seed defaults
  for (let i = 0; i < DEFAULT_ONBOARDING_ITEMS.length; i++) {
    await pool.query(
      `INSERT INTO onboarding_items (keycloak_user_id, label, sort_order)
       VALUES ($1, $2, $3)`,
      [keycloakUserId, DEFAULT_ONBOARDING_ITEMS[i], i]
    );
  }

  const seeded = await pool.query(
    `SELECT id, keycloak_user_id AS "keycloakUserId", label, done, sort_order AS "sortOrder"
     FROM onboarding_items
     WHERE keycloak_user_id = $1
     ORDER BY sort_order ASC`,
    [keycloakUserId]
  );
  return seeded.rows;
}

export async function toggleOnboardingItem(id: string, done: boolean): Promise<void> {
  await initOnboardingTable();
  await pool.query('UPDATE onboarding_items SET done = $2 WHERE id = $1', [id, done]);
}

export async function resetOnboardingChecklist(keycloakUserId: string): Promise<void> {
  await initOnboardingTable();
  await pool.query(
    'UPDATE onboarding_items SET done = false WHERE keycloak_user_id = $1',
    [keycloakUserId]
  );
}

// ── Follow-ups ────────────────────────────────────────────────────────────────

export interface FollowUp {
  id: string;
  keycloakUserId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  reason: string;
  dueDate: Date;
  done: boolean;
  createdAt: Date;
}

async function initFollowUpsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id  TEXT,
      client_name       TEXT,
      client_email      TEXT,
      reason            TEXT        NOT NULL,
      due_date          DATE        NOT NULL,
      done              BOOLEAN     NOT NULL DEFAULT false,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function createFollowUp(params: {
  keycloakUserId?: string;
  clientName?: string;
  clientEmail?: string;
  reason: string;
  dueDate: string;
}): Promise<FollowUp> {
  await initFollowUpsTable();
  const result = await pool.query(
    `INSERT INTO follow_ups (keycloak_user_id, client_name, client_email, reason, due_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id,
               keycloak_user_id AS "keycloakUserId",
               client_name      AS "clientName",
               client_email     AS "clientEmail",
               reason,
               due_date         AS "dueDate",
               done,
               created_at       AS "createdAt"`,
    [
      params.keycloakUserId ?? null,
      params.clientName ?? null,
      params.clientEmail ?? null,
      params.reason,
      params.dueDate,
    ]
  );
  return result.rows[0];
}

export async function listFollowUps(showDone = false): Promise<FollowUp[]> {
  await initFollowUpsTable();
  const result = await pool.query(
    `SELECT id,
            keycloak_user_id AS "keycloakUserId",
            client_name      AS "clientName",
            client_email     AS "clientEmail",
            reason,
            due_date         AS "dueDate",
            done,
            created_at       AS "createdAt"
     FROM follow_ups
     WHERE ($1 OR done = false)
     ORDER BY due_date ASC`,
    [showDone]
  );
  return result.rows;
}

export async function getDueFollowUps(): Promise<FollowUp[]> {
  await initFollowUpsTable();
  const result = await pool.query(
    `SELECT id,
            keycloak_user_id AS "keycloakUserId",
            client_name      AS "clientName",
            client_email     AS "clientEmail",
            reason,
            due_date         AS "dueDate",
            done,
            created_at       AS "createdAt"
     FROM follow_ups
     WHERE done = false AND due_date <= CURRENT_DATE
     ORDER BY due_date ASC`
  );
  return result.rows;
}

export async function updateFollowUp(id: string, params: {
  done?: boolean;
  dueDate?: string;
  reason?: string;
}): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [id];
  let idx = 2;

  if (params.done !== undefined) { sets.push(`done = $${idx}`); values.push(params.done); idx++; }
  if (params.dueDate !== undefined) { sets.push(`due_date = $${idx}`); values.push(params.dueDate); idx++; }
  if (params.reason !== undefined) { sets.push(`reason = $${idx}`); values.push(params.reason); idx++; }

  if (sets.length === 0) return;
  await pool.query(`UPDATE follow_ups SET ${sets.join(', ')} WHERE id = $1`, values);
}

export async function deleteFollowUp(id: string): Promise<void> {
  await pool.query('DELETE FROM follow_ups WHERE id = $1', [id]);
}

// Appointments/Calendar domain extracted to appointments-db.ts (G-SIZE03)
// Temporary re-export so callers that still import from website-db keep working
// until Task 2 updates their imports — removed after all callers are updated.
export {
  listTasksInMonth,
  listProjectsInMonth,
  listMeetingsInRange,
} from './appointments-db';
export type {
  CalendarTask,
  CalendarProject,
  CalendarMeeting,
} from './appointments-db';



// ── T001490: Content-domain DB readers/writers removed ───────────────────────
//
// All public-page content (homepage, faq, kontakt, ueber-mich, services,
// leistungen, stammdaten, navigation, footer, kore-flags, referenzen, seo)
// is now sourced from the build-time content bundle at
// `website/content/<brand>/<domain>.json`. Writes go through the bot-PR
// publish pipeline (Task 6/7). The DB-backed functions and the
// supporting `ServiceOverride` / `LeistungServiceOverride` /
// `LeistungCategoryOverride` / `NavItem` / `FooterColumn` /
// `FooterConfig` / `Stammdaten` / `KoreFlags` / `HomepageContent` /
// `UebermichContent` / `FaqItem` / `KontaktContent` types and the
// `service_config` / `leistungen_config` / `referenzen_config` table
// initializers have been removed. The `site_settings` key-value store
// is retained for non-content admin use (vacation periods, e-mail
// settings, backup, etc.) — content keys (NAV_KEY, FOOTER_KEY,
// STAMMDATEN_KEY, KORE_FLAGS_KEY, PRICING_HIGHLIGHT_KEY,
// seo_title_*, seo_meta_desc_*, seo_og_image_*) are no longer read or
// written by the public surface.
//
// `getServiceConfig` / `getLeistungenConfig` / `getReferenzen` /
// `getHomepageContent` / `getUebermichContent` / `getFaqContent` /
// `getKontaktContent` are intentionally NOT exported from this file
// (the BATS contract `tests/spec/website-core.bats:152` asserts this).
// The save-side equivalents (save*) have also been removed; admin
// endpoints are rewired in Task 7 to call `publishContent` from
// `./content-publish` instead.
//
// For convenience during the migration window, this file still
// re-exports the canonical content-domain types from
// `./content-schema` under their pre-T001490 names — type-only, zero
// runtime cost. The admin save endpoints import these via the
// `ServiceOverride` / `LeistungCategoryOverride` aliases below until
// they are fully migrated.

// ── Admin Shortcuts ──────────────────────────────────────────────────────────

export interface AdminShortcut {
  id: string;
  url: string;
  label: string;
  sortOrder: number;
  createdAt: Date;
}

async function initAdminShortcutsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_shortcuts (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      url        TEXT NOT NULL,
      label      TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function listAdminShortcuts(): Promise<AdminShortcut[]> {
  await initAdminShortcutsTable();
  const result = await pool.query(
    `SELECT id, url, label, sort_order AS "sortOrder", created_at AS "createdAt"
     FROM admin_shortcuts
     ORDER BY created_at ASC`
  );
  return result.rows;
}

export async function createAdminShortcut(url: string, label: string): Promise<AdminShortcut> {
  await initAdminShortcutsTable();
  const result = await pool.query(
    `INSERT INTO admin_shortcuts (url, label)
     VALUES ($1, $2)
     RETURNING id, url, label, sort_order AS "sortOrder", created_at AS "createdAt"`,
    [url, label]
  );
  return result.rows[0];
}

export async function deleteAdminShortcut(id: string): Promise<void> {
  await initAdminShortcutsTable();
  await pool.query('DELETE FROM admin_shortcuts WHERE id = $1', [id]);
}

export async function updateAdminShortcut(
  id: string,
  fields: { url?: string; label?: string }
): Promise<AdminShortcut | null> {
  await initAdminShortcutsTable();
  const sets: string[] = [];
  const vals: unknown[] = [id];
  if (fields.url !== undefined)   { vals.push(fields.url);   sets.push(`url   = $${vals.length}`); }
  if (fields.label !== undefined) { vals.push(fields.label); sets.push(`label = $${vals.length}`); }
  if (sets.length === 0) return null;
  const result = await pool.query(
    `UPDATE admin_shortcuts SET ${sets.join(', ')}
     WHERE id = $1
     RETURNING id, url, label, sort_order AS "sortOrder", created_at AS "createdAt"`,
    vals
  );
  return result.rows[0] ?? null;
}

// ── DSGVO Audit Log ──────────────────────────────────────────────────────────

async function initDsgvoAuditTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dsgvo_audit_log (
      id         BIGSERIAL PRIMARY KEY,
      type       TEXT        NOT NULL,
      name       TEXT        NOT NULL,
      email      TEXT        NOT NULL,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deadline   TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (created_at + INTERVAL '30 days') STORED
    )
  `);
}

export async function insertDsgvoRequest(params: {
  type: string;
  name: string;
  email: string;
  ipAddress?: string;
}): Promise<void> {
  await initDsgvoAuditTable();
  await pool.query(
    `INSERT INTO dsgvo_audit_log (type, name, email, ip_address)
     VALUES ($1, $2, $3, $4)`,
    [params.type, params.name, params.email, params.ipAddress ?? null]
  );
}

// ── Invoice Counter ────────────────────────────────────────────────────────────

let invoiceCountersReady = false;
async function initInvoiceCountersTable(): Promise<void> {
  if (invoiceCountersReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_counters (
      brand   TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT NULL,
      year    INT  NOT NULL,
      kind    TEXT NOT NULL DEFAULT 'invoice',
      counter INT  NOT NULL DEFAULT 0,
      PRIMARY KEY (brand, year, kind)
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_counters_brand_fkey') THEN
          ALTER TABLE invoice_counters ADD CONSTRAINT invoice_counters_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='invoice_counters' AND column_name='kind'
      ) THEN
        ALTER TABLE invoice_counters ADD COLUMN kind TEXT NOT NULL DEFAULT 'invoice';
        ALTER TABLE invoice_counters DROP CONSTRAINT invoice_counters_pkey;
        ALTER TABLE invoice_counters ADD PRIMARY KEY (brand, year, kind);
      END IF;
    END $$
  `);
  invoiceCountersReady = true;
}

export async function getNextInvoiceNumber(brand: string, kind: 'invoice' | 'gutschrift' = 'invoice'): Promise<string> {
  await initInvoiceCountersTable();
  const year = new Date().getFullYear();
  const result = await pool.query<{ counter: number }>(
    `INSERT INTO invoice_counters (brand, year, kind, counter)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (brand, year, kind)
     DO UPDATE SET counter = invoice_counters.counter + 1
     RETURNING counter`,
    [brand, year, kind]
  );
  const n = result.rows[0].counter;
  const prefix = kind === 'gutschrift' ? 'GS' : 'RE';
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
}

export async function seedInvoiceCounter(
  brand: string, year: number, value: number
): Promise<void> {
  await initInvoiceCountersTable();
  await pool.query(
    `INSERT INTO invoice_counters (brand, year, counter)
     VALUES ($1, $2, $3)
     ON CONFLICT (brand, year, kind) DO NOTHING`,
    [brand, year, value]
  );
}

// ── Brett ────────────────────────────────────────────────────────────────────

// Atomically claim the right to post the brett link for a meeting exactly once.
// Returns true if this caller won the claim (and should post), false if already posted.
export async function claimBrettLinkPost(meetingId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE meetings
        SET brett_link_posted_at = now()
      WHERE id = $1 AND brett_link_posted_at IS NULL
      RETURNING id`,
    [meetingId]
  );
  return result.rowCount === 1;
}

// Test infra domain extracted to test-infra-db.ts (G-SIZE03)
// Temporary re-exports — will be removed after callers update imports.
export {
  saveTestRun, updateTestRun, listTestRuns,
  saveTestResults, listFlakeWindow, getTestRunTrend, listLastTestStatusPerTest,
  savePlaywrightReport, getLatestPlaywrightReport,
} from './test-infra-db';
export type {
  TestRun, TestResultRow, SavedTestResult, FlakeRow, TrendRow, PlaywrightReport,
} from './test-infra-db';

// ── Custom Website Sections ────────────────────────────────────────────────

export interface CustomSectionField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'url';
  required: boolean;
}

export interface CustomSection {
  id: string;
  slug: string;
  title: string;
  sort_order: number;
  fields: CustomSectionField[];
  content: Record<string, string>;
  created_at: Date;
  updated_at: Date;
}

let customSectionsReady = false;
// NOTE: Custom sections are not brand-scoped (unlike other content tables).
// This is intentional for the current single-brand deployment. If multi-brand
// support is needed, add a brand TEXT column and filter all queries accordingly.
async function initCustomSectionsTable(): Promise<void> {
  if (customSectionsReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS website_custom_sections (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      slug        TEXT        UNIQUE NOT NULL,
      title       TEXT        NOT NULL,
      sort_order  INT         NOT NULL DEFAULT 0,
      fields      JSONB       NOT NULL DEFAULT '[]',
      content     JSONB       NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  customSectionsReady = true;
}

export async function listCustomSections(): Promise<CustomSection[]> {
  await initCustomSectionsTable();
  const r = await pool.query<CustomSection>(
    `SELECT id, slug, title, sort_order, fields, content, created_at, updated_at
     FROM website_custom_sections ORDER BY sort_order ASC, created_at ASC`
  );
  return r.rows;
}

export async function getCustomSection(slug: string): Promise<CustomSection | null> {
  await initCustomSectionsTable();
  const r = await pool.query<CustomSection>(
    `SELECT id, slug, title, sort_order, fields, content, created_at, updated_at
     FROM website_custom_sections WHERE slug = $1`,
    [slug]
  );
  return r.rows[0] ?? null;
}

export async function createCustomSection(params: {
  slug: string;
  title: string;
  fields: CustomSectionField[];
}): Promise<CustomSection> {
  await initCustomSectionsTable();
  const r = await pool.query<CustomSection>(
    `INSERT INTO website_custom_sections (slug, title, fields)
     VALUES ($1, $2, $3)
     RETURNING id, slug, title, sort_order, fields, content, created_at, updated_at`,
    [params.slug, params.title, JSON.stringify(params.fields)]
  );
  return r.rows[0];
}

export async function updateCustomSection(slug: string, params: {
  title?: string;
  fields?: CustomSectionField[];
  content?: Record<string, string>;
  sort_order?: number;
}): Promise<CustomSection | null> {
  await initCustomSectionsTable();
  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  if (params.title !== undefined) { vals.push(params.title); sets.push(`title = $${vals.length}`); }
  if (params.fields !== undefined) { vals.push(JSON.stringify(params.fields)); sets.push(`fields = $${vals.length}`); }
  if (params.content !== undefined) { vals.push(JSON.stringify(params.content)); sets.push(`content = $${vals.length}`); }
  if (params.sort_order !== undefined) { vals.push(params.sort_order); sets.push(`sort_order = $${vals.length}`); }
  if (vals.length === 0) return getCustomSection(slug);
  vals.push(slug);
  const r = await pool.query<CustomSection>(
    `UPDATE website_custom_sections SET ${sets.join(', ')}
     WHERE slug = $${vals.length}
     RETURNING id, slug, title, sort_order, fields, content, created_at, updated_at`,
    vals
  );
  return r.rows[0] ?? null;
}

export async function deleteCustomSection(slug: string): Promise<void> {
  await initCustomSectionsTable();
  await pool.query('DELETE FROM website_custom_sections WHERE slug = $1', [slug]);
}

// Billing schema-init domain extracted to billing-db.ts (G-SIZE03)
// Temporary re-exports — will be removed after callers update imports.
export { initBillingTables, initTaxMonitorTables, initEurTables } from './billing-db';

// ── (end of billing — was lines 2912-3519, extracted to billing-db.ts) ───────


// ─── Service-page content store (per-slug) ────────────────────────────────────

async function initServicePageConfigTable(): Promise<void> {
  return ensureSchemaOnce('service_page_config', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_page_config (
        brand        TEXT NOT NULL REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        slug         TEXT NOT NULL,
        page_content JSONB,
        version      INTEGER NOT NULL DEFAULT 0,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (brand, slug)
      )
    `);
  });
}

// ─── Content-Store accessors (T000306) ────────────────────────────────────────

export interface ContentRead { value: unknown; version: number }

export class ContentConflictError extends Error {
  code = 'CONFLICT' as const;
  constructor(
    public currentVersion: number,
    public currentValue: unknown,
    public editor: string | null,
  ) {
    super('content version conflict');
  }
}

function safeJson(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

async function liveRead(
  client: Pool | PoolClient,
  brand: string,
  ref: { contentType: string; storeKey: string },
): Promise<ContentRead> {
  switch (ref.contentType) {
    case 'site_setting': {
      const r = await client.query(
        'SELECT value, version FROM site_settings WHERE brand=$1 AND key=$2',
        [brand, ref.storeKey],
      );
      return r.rows.length
        ? { value: safeJson(r.rows[0].value), version: r.rows[0].version }
        : { value: null, version: 0 };
    }
    case 'legal_page': {
      const r = await client.query(
        'SELECT content_html, version FROM legal_pages WHERE brand=$1 AND page_key=$2',
        [brand, ref.storeKey],
      );
      return r.rows.length
        ? { value: r.rows[0].content_html, version: r.rows[0].version }
        : { value: null, version: 0 };
    }
    case 'service': {
      await initServicePageConfigTable();
      const r = await client.query(
        'SELECT page_content, version FROM service_page_config WHERE brand=$1 AND slug=$2',
        [brand, ref.storeKey],
      );
      return r.rows.length
        ? { value: safeJson(r.rows[0].page_content), version: r.rows[0].version }
        : { value: null, version: 0 };
    }
    case 'leistungen': {
      const r = await client.query(
        'SELECT categories_json, version FROM leistungen_config WHERE brand=$1',
        [brand],
      );
      return r.rows.length
        ? { value: safeJson(r.rows[0].categories_json), version: r.rows[0].version }
        : { value: null, version: 0 };
    }
    default:
      throw new Error('unknown contentType ' + ref.contentType);
  }
}

async function liveWrite(
  client: Pool | PoolClient,
  brand: string,
  ref: { contentType: string; storeKey: string },
  value: unknown,
  version: number,
): Promise<void> {
  switch (ref.contentType) {
    case 'site_setting':
      await client.query(
        `INSERT INTO site_settings (brand, key, value, version) VALUES ($1,$2,$3,$4)
         ON CONFLICT (brand, key) DO UPDATE SET value=$3, version=$4`,
        [brand, ref.storeKey, JSON.stringify(value), version],
      );
      return;
    case 'legal_page':
      await client.query(
        `INSERT INTO legal_pages (brand, page_key, content_html, version) VALUES ($1,$2,$3,$4)
         ON CONFLICT (brand, page_key) DO UPDATE SET content_html=$3, version=$4`,
        [brand, ref.storeKey, String(value), version],
      );
      return;
    case 'service':
      await initServicePageConfigTable();
      await client.query(
        `INSERT INTO service_page_config (brand, slug, page_content, version, updated_at) VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (brand, slug) DO UPDATE SET page_content=$3, version=$4, updated_at=now()`,
        [brand, ref.storeKey, JSON.stringify(value), version],
      );
      return;
    case 'leistungen':
      await client.query(
        `INSERT INTO leistungen_config (brand, categories_json, version) VALUES ($1,$2,$3)
         ON CONFLICT (brand) DO UPDATE SET categories_json=$2, version=$3`,
        [brand, JSON.stringify(value), version],
      );
      return;
  }
}

export async function readContent(brand: string, contentKey: string): Promise<ContentRead> {
  const ref = refFor(contentKey);
  if (!ref) throw new Error('unknown contentKey ' + contentKey);
  return liveRead(pool, brand, ref);
}

export async function writeContent(
  brand: string,
  contentKey: string,
  value: unknown,
  baseVersion: number,
  editor: string,
): Promise<{ version: number }> {
  const ref = refFor(contentKey);
  if (!ref) throw new Error('unknown contentKey ' + contentKey);
  const client = await pool.connect();
  let released = false;
  try {
    await client.query('BEGIN');
    const cur = await liveRead(client, brand, ref);
    if (detectConflict(cur.version === 0 ? null : cur.version, baseVersion)) {
      const err = new ContentConflictError(cur.version, cur.value, null);
      await client.query('ROLLBACK').catch(() => {});
      released = true;
      client.release();
      throw err;
    }
    if (cur.value !== null) {
      await client.query(
        `INSERT INTO content_versions (brand, content_key, content_type, snapshot, editor)
         VALUES ($1,$2,$3,$4,$5)`,
        [brand, contentKey, ref.contentType, JSON.stringify({ value: cur.value, version: cur.version }), editor],
      );
    }
    const ver = bumpVersion(cur.version === 0 ? null : cur.version);
    await liveWrite(client, brand, ref, value, ver);
    const ids = await client.query(
      `SELECT id FROM content_versions WHERE brand=$1 AND content_key=$2 ORDER BY created_at DESC`,
      [brand, contentKey],
    );
    const prune = idsToPrune(ids.rows.map((r: Record<string, unknown>) => Number(r.id)));
    if (prune.length) {
      await client.query(`DELETE FROM content_versions WHERE id = ANY($1)`, [prune]);
    }
    await client.query('COMMIT');
    return { version: ver };
  } catch (e) {
    if (!released) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw e;
  } finally {
    if (!released) {
      client.release();
    }
  }
}

export async function listVersions(brand: string, contentKey: string) {
  const r = await pool.query(
    `SELECT id, editor, created_at, snapshot
     FROM content_versions
     WHERE brand=$1 AND content_key=$2
     ORDER BY created_at DESC`,
    [brand, contentKey],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    editor: row.editor,
    createdAt: row.created_at,
    snapshot: safeJson(row.snapshot),
  }));
}
