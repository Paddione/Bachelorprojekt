import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listMembersLearningSummary } from '../../../../lib/learning-db';
import type { MemberLearningSummary } from '../../../../lib/learning-db';
import { listUsers } from '../../../../lib/keycloak';
import type { KcUser } from '../../../../lib/keycloak';

export interface EnrichedMember extends MemberLearningSummary {
  preferred_username: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const brand = session.brand ?? 'mentolder';

  let members: MemberLearningSummary[];
  let totalCount: number;
  try {
    const result = await listMembersLearningSummary(brand, { offset, limit });
    members = result.members;
    totalCount = result.totalCount;
  } catch (err) {
    console.error('[api/admin/members/list] DB error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let kcUsers: KcUser[] = [];
  try {
    kcUsers = await listUsers();
  } catch {
    // Keycloak unavailable — enrich with nulls
  }

  const kcMap = new Map<string, KcUser>();
  for (const u of kcUsers) {
    kcMap.set(u.id, u);
  }

  const enriched: EnrichedMember[] = members.map(m => {
    const kc = kcMap.get(m.keycloakUserId);
    return {
      ...m,
      preferred_username: kc?.username ?? null,
      email: kc?.email ?? null,
      firstName: kc?.firstName ?? null,
      lastName: kc?.lastName ?? null,
    };
  });

  return new Response(
    JSON.stringify({ members: enriched, totalCount, offset, limit }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
