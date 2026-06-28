/**
 * appointments-db.ts — Terminbuchungs- und Kalender-DB-Schicht
 *
 * Extracted from website-db.ts (G-SIZE03 / T001293).
 * Manages calendar views, CalDAV booking links, slot whitelist and
 * free-time-window tables.
 */

import { pool } from './db-pool';
import { initTicketsSchema } from './tickets-schema';

// SQL fragment that maps `tickets.status` back to the old `ProjectStatus`.
// Copied from website-db.ts so this module stays self-contained.
const STATUS_BACK_SQL = `
  CASE __TBL__.status
    WHEN 'triage'      THEN 'entwurf'
    WHEN 'backlog'     THEN 'entwurf'
    WHEN 'in_progress' THEN 'aktiv'
    WHEN 'in_review'   THEN 'aktiv'
    WHEN 'blocked'     THEN 'wartend'
    WHEN 'done'        THEN 'erledigt'
    WHEN 'archived'    THEN 'archiviert'
    ELSE 'entwurf'
  END
`;

/**
 * Ensures the `meetings.project_id` FK column exists.
 * Private helper — mirrors the same init in website-db.ts meetings block.
 */
async function initMeetingProjectLink(): Promise<void> {
  await initTicketsSchema(); // tickets.tickets must exist before the FK column
  await pool.query(`
    ALTER TABLE meetings
      ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES tickets.tickets(id) ON DELETE SET NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id)
  `);
}

// ── Task Calendar ─────────────────────────────────────────────────────────────

export interface CalendarTask {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  dueDate: Date;
  status: string;
  priority: string;
}

export async function listTasksInMonth(year: number, month: number): Promise<CalendarTask[]> {
  await initTicketsSchema();
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT pt.id,
            pt.title AS name,
            COALESCE(parent.parent_id, pt.parent_id) AS "projectId",
            COALESCE(root.title, parent.title)       AS "projectName",
            pt.due_date AS "dueDate",
            (${STATUS_BACK_SQL.replace(/__TBL__/g, 'pt')}) AS status,
            pt.priority
     FROM tickets.tickets pt
     LEFT JOIN tickets.tickets parent ON parent.id = pt.parent_id
     LEFT JOIN tickets.tickets root   ON root.id   = parent.parent_id
     WHERE pt.type='task'
       AND pt.due_date BETWEEN $1::date AND $2::date
     ORDER BY pt.due_date ASC, pt.priority DESC`,
    [firstDay, lastDay]
  );
  return result.rows;
}

export interface CalendarProject {
  id: string;
  name: string;
  status: string;
  priority: string;
  customerId: string | null;
  customerName: string | null;
  startDate: Date | null;
  dueDate: Date | null;
}

export async function listProjectsInMonth(year: number, month: number, brand?: string): Promise<CalendarProject[]> {
  await initTicketsSchema();
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const result = await pool.query<CalendarProject>(
    `SELECT p.id,
            p.title AS name,
            (${STATUS_BACK_SQL.replace(/__TBL__/g, 'p')}) AS status,
            p.priority,
            p.customer_id AS "customerId",
            c.name        AS "customerName",
            p.start_date  AS "startDate",
            p.due_date    AS "dueDate"
     FROM tickets.tickets p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.type='project' AND p.parent_id IS NULL
       AND p.status NOT IN ('archived', 'done')
       AND ($1::text IS NULL OR p.brand = $1)
       AND (
         (p.start_date BETWEEN $2::date AND $3::date)
         OR (p.due_date BETWEEN $2::date AND $3::date)
       )
     ORDER BY COALESCE(p.start_date, p.due_date) ASC`,
    [brand ?? null, firstDay, lastDay]
  );
  return result.rows;
}

// ── Calendar Meetings (range query) ───────────────────────────────────────────

export interface CalendarMeeting {
  id: string;
  meetingType: string;
  status: string;
  scheduledAt: Date;
  customerId: string;
  customerName: string;
  customerEmail: string;
  talkRoomToken: string | null;
  projectId: string | null;
  projectName: string | null;
}

/**
 * Returns all meetings whose `scheduled_at` falls inside the inclusive range
 * `[fromIso, toIso]`. Used by the admin calendar to render meetings alongside
 * tasks, projects and CalDAV bookings (T000161, T000164, T000167).
 */
export async function listMeetingsInRange(fromIso: string, toIso: string): Promise<CalendarMeeting[]> {
  await initMeetingProjectLink();
  const result = await pool.query<CalendarMeeting>(
    `SELECT m.id,
            m.meeting_type AS "meetingType",
            m.status,
            m.scheduled_at AS "scheduledAt",
            m.customer_id  AS "customerId",
            m.talk_room_token AS "talkRoomToken",
            c.name  AS "customerName",
            c.email AS "customerEmail",
            p.id    AS "projectId",
            p.title AS "projectName"
       FROM meetings m
       JOIN customers c ON m.customer_id = c.id
       LEFT JOIN tickets.tickets p ON m.project_id = p.id
      WHERE m.scheduled_at IS NOT NULL
        AND m.scheduled_at >= $1::timestamptz
        AND m.scheduled_at <= $2::timestamptz
        AND m.status NOT IN ('cancelled')
      ORDER BY m.scheduled_at ASC`,
    [fromIso, toIso]
  );
  return result.rows;
}

// ── Booking-Project Links ─────────────────────────────────────────────────────

let bookingProjectLinksReady = false;
async function initBookingProjectLinks(): Promise<void> {
  if (bookingProjectLinksReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_project_links (
      caldav_uid  TEXT    NOT NULL,
      brand       TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT    NOT NULL,
      project_id  UUID    REFERENCES tickets.tickets(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (caldav_uid, brand)
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_project_links_brand_fkey') THEN
          ALTER TABLE booking_project_links ADD CONSTRAINT booking_project_links_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  await pool.query(`
    ALTER TABLE booking_project_links ADD COLUMN IF NOT EXISTS leistung_key TEXT
  `);
  bookingProjectLinksReady = true;
}

// ── Booking-Invoice Mapping ───────────────────────────────────────────────────

let bookingInvoiceLinksReady = false;
async function initBookingInvoiceLinksTable(): Promise<void> {
  if (bookingInvoiceLinksReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_invoice_links (
      caldav_uid      TEXT        NOT NULL,
      brand           TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT        NOT NULL,
      invoice_id      TEXT        NOT NULL,
      invoice_number  TEXT        NOT NULL,
      amount          NUMERIC(10,2) NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (caldav_uid, brand)
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_invoice_links_brand_fkey') THEN
          ALTER TABLE booking_invoice_links ADD CONSTRAINT booking_invoice_links_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
  bookingInvoiceLinksReady = true;
}

export async function setBookingInvoice(
  caldavUid: string,
  brand: string,
  invoiceId: string,
  invoiceNumber: string,
  amount: number
): Promise<void> {
  await initBookingInvoiceLinksTable();
  await pool.query(
    `INSERT INTO booking_invoice_links (caldav_uid, brand, invoice_id, invoice_number, amount)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (caldav_uid, brand) DO UPDATE
       SET invoice_id = EXCLUDED.invoice_id,
           invoice_number = EXCLUDED.invoice_number,
           amount = EXCLUDED.amount`,
    [caldavUid, brand, invoiceId, invoiceNumber, amount]
  );
}

export interface BookingInvoiceInfo {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

export async function getBookingInvoices(caldavUids: string[], brand: string): Promise<Map<string, BookingInvoiceInfo>> {
  if (caldavUids.length === 0) return new Map();
  await initBookingInvoiceLinksTable();
  const result = await pool.query(
    `SELECT caldav_uid, invoice_id, invoice_number, amount
     FROM booking_invoice_links
     WHERE caldav_uid = ANY($1) AND brand = $2`,
    [caldavUids, brand]
  );
  return new Map(
    result.rows.map((r: {
      caldav_uid: string;
      invoice_id: string;
      invoice_number: string;
      amount: string;
    }) => [
      r.caldav_uid,
      {
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number,
        amount: parseFloat(r.amount),
      },
    ])
  );
}

export async function getBookingProjects(caldavUids: string[], brand: string): Promise<Map<string, string>> {
  if (caldavUids.length === 0) return new Map();
  await initBookingProjectLinks();
  const result = await pool.query(
    `SELECT caldav_uid, project_id FROM booking_project_links
     WHERE caldav_uid = ANY($1) AND brand = $2 AND project_id IS NOT NULL`,
    [caldavUids, brand]
  );
  return new Map(result.rows.map((r: { caldav_uid: string; project_id: string }) => [r.caldav_uid, r.project_id]));
}

export async function setBookingProject(
  caldavUid: string,
  projectId: string | null,
  brand: string,
  leistungKey?: string
): Promise<void> {
  await initBookingProjectLinks();
  if (!projectId) {
    await pool.query(
      `DELETE FROM booking_project_links WHERE caldav_uid = $1 AND brand = $2`,
      [caldavUid, brand]
    );
  } else {
    await pool.query(
      `INSERT INTO booking_project_links (caldav_uid, brand, project_id, leistung_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (caldav_uid, brand) DO UPDATE
         SET project_id  = EXCLUDED.project_id,
             leistung_key = EXCLUDED.leistung_key`,
      [caldavUid, brand, projectId, leistungKey ?? null]
    );
  }
}

export async function getBookingLeistungen(caldavUids: string[], brand: string): Promise<Map<string, string>> {
  if (caldavUids.length === 0) return new Map();
  await initBookingProjectLinks();
  const result = await pool.query(
    `SELECT caldav_uid, leistung_key FROM booking_project_links
     WHERE caldav_uid = ANY($1) AND brand = $2 AND leistung_key IS NOT NULL`,
    [caldavUids, brand]
  );
  return new Map(result.rows.map((r: { caldav_uid: string; leistung_key: string }) => [r.caldav_uid, r.leistung_key]));
}

// ── Slot Whitelist ────────────────────────────────────────────────────────────

export interface WhitelistedSlot {
  slotStart: Date;
  slotEnd: Date;
}

async function initSlotWhitelistTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slot_whitelist (
      brand      TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT        NOT NULL,
      slot_start TIMESTAMPTZ NOT NULL,
      slot_end   TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (brand, slot_start)
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slot_whitelist_brand_fkey') THEN
          ALTER TABLE slot_whitelist ADD CONSTRAINT slot_whitelist_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
}

export async function getWhitelistedSlots(brand: string): Promise<WhitelistedSlot[]> {
  await initSlotWhitelistTable();
  // Only return future slots for display — isSlotWhitelisted has no time filter
  // so booking validation works even for slots that just started.
  const result = await pool.query(
    `SELECT slot_start AS "slotStart", slot_end AS "slotEnd"
     FROM slot_whitelist
     WHERE brand = $1 AND slot_start > now()
     ORDER BY slot_start ASC`,
    [brand]
  );
  return result.rows;
}

export async function addSlotToWhitelist(brand: string, start: Date, end: Date): Promise<void> {
  await initSlotWhitelistTable();
  await pool.query(
    `INSERT INTO slot_whitelist (brand, slot_start, slot_end)
     VALUES ($1, $2, $3)
     ON CONFLICT (brand, slot_start) DO UPDATE SET slot_end = $3`,
    [brand, start, end]
  );
}

export async function removeSlotFromWhitelist(brand: string, start: Date): Promise<void> {
  await initSlotWhitelistTable();
  await pool.query(
    'DELETE FROM slot_whitelist WHERE brand = $1 AND slot_start = $2::timestamptz',
    [brand, start]
  );
}

export async function isSlotWhitelisted(brand: string, start: Date): Promise<boolean> {
  await initSlotWhitelistTable();
  const result = await pool.query(
    'SELECT 1 FROM slot_whitelist WHERE brand = $1 AND slot_start = $2::timestamptz',
    [brand, start]
  );
  return (result.rowCount ?? 0) > 0;
}

// Atomically removes the slot from the whitelist and returns true if it was
// available (i.e. not already claimed by another concurrent booking).
export async function claimSlot(brand: string, start: Date): Promise<boolean> {
  await initSlotWhitelistTable();
  const result = await pool.query(
    'DELETE FROM slot_whitelist WHERE brand = $1 AND slot_start = $2::timestamptz RETURNING 1',
    [brand, start]
  );
  return (result.rowCount ?? 0) > 0;
}

// ── Free Time Windows ────────────────────────────────────────────────────────

export interface FreeTimeWindow {
  id: string;
  date: string;     // YYYY-MM-DD
  winStart: string; // HH:MM
  winEnd: string;   // HH:MM
}

async function initFreeTimeWindowsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS free_time_windows (
      id         TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
      brand      TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT        NOT NULL,
      date       DATE        NOT NULL,
      win_start  TIME        NOT NULL,
      win_end    TIME        NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (id)
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'free_time_windows_brand_fkey') THEN
          ALTER TABLE free_time_windows ADD CONSTRAINT free_time_windows_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
  `);
}

export async function getFreeTimeWindows(brand: string, fromDate?: string, toDate?: string): Promise<FreeTimeWindow[]> {
  await initFreeTimeWindowsTable();
  const result = await pool.query(
    `SELECT id,
            to_char(date, 'YYYY-MM-DD')   AS date,
            to_char(win_start, 'HH24:MI') AS "winStart",
            to_char(win_end,   'HH24:MI') AS "winEnd"
     FROM free_time_windows
     WHERE brand = $1
       AND ($2::date IS NULL OR date >= $2::date)
       AND ($3::date IS NULL OR date <= $3::date)
     ORDER BY date ASC, win_start ASC`,
    [brand, fromDate ?? null, toDate ?? null]
  );
  return result.rows;
}

export async function addFreeTimeWindow(brand: string, date: string, winStart: string, winEnd: string): Promise<string> {
  await initFreeTimeWindowsTable();
  const result = await pool.query(
    `INSERT INTO free_time_windows (brand, date, win_start, win_end)
     VALUES ($1, $2::date, $3::time, $4::time)
     RETURNING id`,
    [brand, date, winStart, winEnd]
  );
  return result.rows[0].id as string;
}

export async function removeFreeTimeWindow(brand: string, id: string): Promise<void> {
  await initFreeTimeWindowsTable();
  await pool.query(
    'DELETE FROM free_time_windows WHERE id = $1 AND brand = $2',
    [id, brand]
  );
}

export async function isSlotInAnyWindow(brand: string, slotStart: Date, slotEnd: Date): Promise<boolean> {
  await initFreeTimeWindowsTable();
  const dateStr = slotStart.toISOString().split('T')[0];
  const sh = slotStart.getHours().toString().padStart(2, '0');
  const sm = slotStart.getMinutes().toString().padStart(2, '0');
  const eh = slotEnd.getHours().toString().padStart(2, '0');
  const em = slotEnd.getMinutes().toString().padStart(2, '0');
  const result = await pool.query(
    `SELECT 1 FROM free_time_windows
     WHERE brand = $1
       AND date = $2::date
       AND win_start <= $3::time
       AND win_end   >= $4::time`,
    [brand, dateStr, `${sh}:${sm}`, `${eh}:${em}`]
  );
  return (result.rowCount ?? 0) > 0;
}
