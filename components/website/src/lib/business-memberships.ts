// components/website/src/lib/business-memberships.ts
// Data access for user-to-business memberships (T901022).
// Pure module: the only import is the shared connection pool. All
// statements are parameterized DML; schema lives in the migration only.
import { pool } from './messaging-db-pool';

export type BusinessRole = 'owner' | 'member';

export interface BusinessMembership {
  userKey: string;
  brand: string;
  role: BusinessRole;
  createdAt: Date;
}

interface MembershipRow {
  user_key: string;
  brand: string;
  role: BusinessRole;
  created_at: Date;
}

function toMembership(row: MembershipRow): BusinessMembership {
  return {
    userKey: row.user_key,
    brand: row.brand,
    role: row.role,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = 'user_key, brand, role, created_at';

export async function listMembershipsForUser(userKey: string): Promise<BusinessMembership[]> {
  const { rows } = await pool.query<MembershipRow>(
    `SELECT ${SELECT_COLUMNS} FROM public.business_memberships WHERE user_key = $1 ORDER BY brand ASC`,
    [userKey],
  );
  return rows.map(toMembership);
}

export async function listMembershipsForBrand(brand: string): Promise<BusinessMembership[]> {
  const { rows } = await pool.query<MembershipRow>(
    `SELECT ${SELECT_COLUMNS} FROM public.business_memberships WHERE brand = $1 ORDER BY user_key ASC`,
    [brand],
  );
  return rows.map(toMembership);
}

export async function getMembership(userKey: string, brand: string): Promise<BusinessMembership | null> {
  const { rows } = await pool.query<MembershipRow>(
    `SELECT ${SELECT_COLUMNS} FROM public.business_memberships WHERE user_key = $1 AND brand = $2`,
    [userKey, brand],
  );
  return rows.length > 0 ? toMembership(rows[0]) : null;
}

export async function addMembership(params: {
  userKey: string;
  brand: string;
  role: BusinessRole;
}): Promise<BusinessMembership> {
  const { rows } = await pool.query<MembershipRow>(
    `INSERT INTO public.business_memberships (user_key, brand, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_key, brand) DO UPDATE SET role = EXCLUDED.role
     RETURNING ${SELECT_COLUMNS}`,
    [params.userKey, params.brand, params.role],
  );
  return toMembership(rows[0]);
}

export async function removeMembership(userKey: string, brand: string): Promise<number> {
  const result = await pool.query(
    'DELETE FROM public.business_memberships WHERE user_key = $1 AND brand = $2',
    [userKey, brand],
  );
  return result.rowCount ?? 0;
}
