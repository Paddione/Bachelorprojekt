/**
 * website-core-db.ts — Customer, Bug Tickets, Site Settings, Vacation, Legal Pages
 *
 * Stage 1 extraction from website-db.ts (T002149 / G-SIZE03).
 * Contains: Customer CRUD, Bug Tickets, Site Settings key/value store,
 * Vacation/Blackout Periods, Legal Pages (admin-editable HTML).
 */
import { pool, ensureSchemaOnce } from './db-pool';
import { initTicketsSchema } from './tickets-schema';
import { transitionTicket } from './tickets/transition';
import type { Customer } from './customer-types';

export type { Customer } from './customer-types';

// ── Customer ────────────────────────────────────────────────────────────────

// Type moved to customer-types.ts (neutral leaf module) to avoid a
// website-db.ts <-> project-portal-db.ts import cycle (S2 quality gate).
// Re-exported here for backward compatibility with existing callers.

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

// ── Vacation / Blackout Periods ───────────────────────────────────────────────
//
// Admin-managed vacation periods stored as a JSON blob in site_settings.
// Not part of the content bundle (calendar metadata, not public page
// content) — stays on the DB-backed site_settings key-value store.
export interface VacationPeriod {
  id: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  label: string;
}

export async function getVacationPeriods(brand: string): Promise<VacationPeriod[]> {
  const raw = await getSiteSetting(brand, 'vacation_periods');
  if (!raw) return [];
  try { return JSON.parse(raw) as VacationPeriod[]; } catch { return []; }
}

export async function saveVacationPeriods(brand: string, periods: VacationPeriod[]): Promise<void> {
  await setSiteSetting(brand, 'vacation_periods', JSON.stringify(periods));
}

// ── Legal Pages (admin-editable HTML content) ────────────────────────────────
//
// Legal pages (impressum, datenschutz, etc.) are admin-editable HTML
// blobs — NOT part of the content bundle (the bundle holds structured
// data; legal pages are arbitrary HTML with token replacement). They
// stay on the DB-backed `legal_pages` table until a future T001490
// follow-up migrates them to a publish-pipeline domain.
export async function initLegalPagesTable(): Promise<void> {
  return ensureSchemaOnce('legal_pages', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS legal_pages (
        brand        TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        page_key     TEXT,
        content_html TEXT NOT NULL,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (brand, page_key)
      );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'legal_pages_brand_fkey') THEN
          ALTER TABLE legal_pages ADD CONSTRAINT legal_pages_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
    `);
  });
}

export async function getLegalPage(brand: string, pageKey: string): Promise<string | null> {
  await initLegalPagesTable();
  const result = await pool.query(
    'SELECT content_html FROM legal_pages WHERE brand = $1 AND page_key = $2',
    [brand, pageKey]
  );
  return result.rows[0]?.content_html ?? null;
}

export async function saveLegalPage(brand: string, pageKey: string, contentHtml: string): Promise<void> {
  await initLegalPagesTable();
  await pool.query(
    `INSERT INTO legal_pages (brand, page_key, content_html, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (brand, page_key) DO UPDATE SET content_html = $3, updated_at = now()`,
    [brand, pageKey, contentHtml]
  );
}
