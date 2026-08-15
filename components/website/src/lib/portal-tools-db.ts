import { pool } from './db-pool';

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
