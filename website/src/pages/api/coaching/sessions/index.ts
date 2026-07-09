import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listCoachSessions, type ListCoachSessionsOpts } from '../../../../../lib/coaching-session-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

// Non-admin endpoint: coaches can access their own coaching sessions
// Requires authentication but NOT admin role
export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // If user is admin, redirect to the full admin sessions endpoint
  if (isAdmin(session)) {
    return Astro.redirect('/admin/coaching/sessions');
  }

  // Non-admin users must have clientId assigned (coach role)
  const clientId = session.clientId;
  if (!clientId) {
    return new Response('Forbidden: User is not assigned to any clients', { status: 403 });
  }

  const brand = process.env.BRAND || 'mentolder';
  const q = url.searchParams.get('q') ?? undefined;
  const sort = (url.searchParams.get('sort') ?? undefined) as
    | 'title' 
    | 'client_name' 
    | 'created_at' 
    | 'status' 
    | undefined;
  const order = (url.searchParams.get('order') ?? undefined) as 'asc' | 'desc' | undefined;
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
  const archived = url.searchParams.get('archived') === 'true';
  const statusParam = url.searchParams.getAll('status');

  const result = await listCoachSessions(pool, brand, clientId, { 
    q, 
    sort, 
    order, 
    page, 
    pageSize, 
    archived, 
    status: statusParam 
  });

  return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
};
