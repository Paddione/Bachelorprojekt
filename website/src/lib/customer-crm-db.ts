import { pool, ensureSchemaOnce } from './website-db';

export function ensureCustomerCrmSchema(): Promise<void> {
  return ensureSchemaOnce('customer_crm', async () => {
    await pool.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS postal_code TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'DE';
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_contact_channel TEXT DEFAULT 'email';
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS communication_frequency TEXT DEFAULT 'monatlich';
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS bio TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_status TEXT DEFAULT 'aktiv';
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_contact_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        keycloak_user_id TEXT NOT NULL,
        contact_type TEXT NOT NULL,
        subject TEXT,
        content TEXT,
        direction TEXT DEFAULT 'outbound',
        admin_id TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        metadata JSONB DEFAULT '{}'
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_contact_history_user
        ON customer_contact_history(keycloak_user_id, created_at DESC);
    `);
  });
}

export const CONTACT_CHANNELS = ['email', 'phone', 'portal'] as const;
export const COMM_FREQUENCIES = ['wöchentlich', 'zweiwöchentlich', 'monatlich', 'bei_bedarf'] as const;
export const CUSTOMER_STATUSES = ['aktiv', 'inaktiv', 'potentiell', 'pausiert', 'abgeschlossen'] as const;
export const CONTACT_TYPES = ['email', 'phone', 'meeting', 'note'] as const;

type ContactChannel = typeof CONTACT_CHANNELS[number];
type CommFrequency = typeof COMM_FREQUENCIES[number];
export type CustomerStatus = typeof CUSTOMER_STATUSES[number];
export type ContactType = typeof CONTACT_TYPES[number];

export interface ProfileInput {
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  preferred_contact_channel?: string;
  communication_frequency?: string;
  bio?: string;
}

const MAXLEN: Record<keyof ProfileInput, number> = {
  phone: 30, company: 100, address: 200, city: 100, postal_code: 10,
  country: 2, preferred_contact_channel: 20, communication_frequency: 20, bio: 500,
};

export function validateProfileInput(input: ProfileInput): { ok: true } | { ok: false; error: string } {
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return { ok: false, error: `${k}: ungültiger Typ` };
    const max = MAXLEN[k as keyof ProfileInput];
    if (max && v.length > max) return { ok: false, error: `${k}: zu lang (max. ${max} Zeichen)` };
  }
  if (input.preferred_contact_channel && !CONTACT_CHANNELS.includes(input.preferred_contact_channel as ContactChannel))
    return { ok: false, error: 'Ungültiger Kontaktkanal.' };
  if (input.communication_frequency && !COMM_FREQUENCIES.includes(input.communication_frequency as CommFrequency))
    return { ok: false, error: 'Ungültige Kommunikationsfrequenz.' };
  return { ok: true };
}

export interface CustomerProfile {
  id: string; name: string; email: string;
  phone?: string; company?: string;
  address?: string; city?: string; postal_code?: string; country?: string;
  preferred_contact_channel?: string; communication_frequency?: string;
  bio?: string; profile_updated_at?: string;
  customer_status?: string; acquisition_source?: string; tags?: string[];
  customer_number?: string;
}

const PROFILE_COLS = `id, name, email, phone, company, address, city, postal_code, country,
  preferred_contact_channel, communication_frequency, bio, profile_updated_at,
  customer_status, acquisition_source, tags, customer_number`;

export async function getCustomerProfile(keycloakUserId: string): Promise<CustomerProfile | null> {
  await ensureCustomerCrmSchema();
  const { rows } = await pool.query(
    `SELECT ${PROFILE_COLS} FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakUserId],
  );
  return rows[0] ?? null;
}

const UPDATABLE: (keyof ProfileInput)[] = [
  'phone', 'company', 'address', 'city', 'postal_code', 'country',
  'preferred_contact_channel', 'communication_frequency', 'bio',
];

export async function updateCustomerProfile(
  keycloakUserId: string, input: ProfileInput,
): Promise<{ updatedAt: string } | null> {
  await ensureCustomerCrmSchema();
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of UPDATABLE) {
    if (input[col] !== undefined) { params.push(input[col]); sets.push(`${col} = $${params.length}`); }
  }
  sets.push('profile_updated_at = now()');
  params.push(keycloakUserId);
  const { rows } = await pool.query(
    `UPDATE customers SET ${sets.join(', ')} WHERE keycloak_user_id = $${params.length}
     RETURNING profile_updated_at`,
    params,
  );
  if (!rows[0]) return null;
  return { updatedAt: rows[0].profile_updated_at };
}

interface ContactHistoryEntry {
  id: string; keycloak_user_id: string; contact_type: string;
  subject?: string; content?: string; direction?: string;
  admin_id?: string; created_at: string;
}

export async function addContactHistoryEntry(params: {
  keycloakUserId: string; contactType: string; subject?: string;
  content?: string; direction?: string; adminId?: string;
}): Promise<ContactHistoryEntry> {
  await ensureCustomerCrmSchema();
  const { rows } = await pool.query(
    `INSERT INTO customer_contact_history
       (keycloak_user_id, contact_type, subject, content, direction, admin_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, keycloak_user_id, contact_type, subject, content, direction, admin_id, created_at`,
    [params.keycloakUserId, params.contactType, params.subject ?? null,
     params.content ?? null, params.direction ?? 'outbound', params.adminId ?? null],
  );
  return rows[0];
}

export async function getContactHistory(
  keycloakUserId: string, limit = 100,
): Promise<ContactHistoryEntry[]> {
  await ensureCustomerCrmSchema();
  const { rows } = await pool.query(
    `SELECT id, keycloak_user_id, contact_type, subject, content, direction, admin_id, created_at
       FROM customer_contact_history
      WHERE keycloak_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [keycloakUserId, Math.min(limit, 100)],
  );
  return rows;
}

export async function updateCustomerCrm(keycloakUserId: string, input: {
  customer_status?: string; acquisition_source?: string; tags?: string[];
}): Promise<boolean> {
  await ensureCustomerCrmSchema();
  if (input.customer_status && !CUSTOMER_STATUSES.includes(input.customer_status as CustomerStatus))
    throw new Error('Ungültiger Status.');
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.customer_status !== undefined) { params.push(input.customer_status); sets.push(`customer_status = $${params.length}`); }
  if (input.acquisition_source !== undefined) { params.push(input.acquisition_source); sets.push(`acquisition_source = $${params.length}`); }
  if (input.tags !== undefined) { params.push(input.tags); sets.push(`tags = $${params.length}::text[]`); }
  if (sets.length === 0) return true;
  params.push(keycloakUserId);
  const res = await pool.query(
    `UPDATE customers SET ${sets.join(', ')} WHERE keycloak_user_id = $${params.length}`, params);
  return (res.rowCount ?? 0) > 0;
}

export async function collectCustomerDsgvoData(keycloakUserId: string): Promise<{
  profile: CustomerProfile | null; contactHistory: ContactHistoryEntry[];
}> {
  const [profile, contactHistory] = await Promise.all([
    getCustomerProfile(keycloakUserId),
    getContactHistory(keycloakUserId, 100),
  ]);
  return { profile, contactHistory };
}
