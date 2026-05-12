import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listTemplates, type TargetSurface, type TemplateStatus } from '../../../../../lib/coaching-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

const SURFACES: TargetSurface[] = ['questionnaire', 'brett', 'chatroom', 'assistant'];
const STATUSES: TemplateStatus[] = ['draft', 'published', 'archived'];

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const surfaceParam = url.searchParams.get('target_surface');
  const statusParam = url.searchParams.get('status');
  const targetSurface = SURFACES.includes(surfaceParam as TargetSurface) ? (surfaceParam as TargetSurface) : undefined;
  const status = STATUSES.includes(statusParam as TemplateStatus) ? (statusParam as TemplateStatus) : undefined;

  const templates = await listTemplates(pool, {
    targetSurface,
    status,
    bookId: url.searchParams.get('book_id') ?? undefined,
    snippetId: url.searchParams.get('snippet_id') ?? undefined,
    latestOnly: url.searchParams.get('latest_only') === 'true',
  });
  return new Response(JSON.stringify(templates), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
