// components/website/src/lib/owner-guard.ts
// Central decision point for owner access (T901022). Server-side pure
// module: the only import is the session layer. All checks fail closed —
// guests, missing groups, and foreign groups are denied, never exceptions.
import { getSession, type UserSession } from './auth';

const OWNER_GROUP = process.env.OWNER_GROUP ?? 'owner';

export function isOwnerSession(session: UserSession | null): boolean {
  if (!session) return false;
  return session.groups?.includes(OWNER_GROUP) ?? false;
}

export async function requireOwner(cookieHeader: string | null): Promise<UserSession | null> {
  const session = await getSession(cookieHeader);
  if (!isOwnerSession(session)) return null;
  return session;
}

export function ownerBusiness(session: UserSession): { brand: string | null } {
  return { brand: session.brand };
}
