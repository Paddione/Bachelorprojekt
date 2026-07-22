// website/src/pages/api/admin/components/index.ts
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listComponents, createComponent } from '../../../../lib/components-db';

export const prerender = false;

const CreateBody = z.object({
  name:     z.string().min(1).max(100),
  kind:     z.enum(['physical', 'non-physical']),
  area:     z.string().min(1).max(50),
  status:   z.enum(['active', 'inactive', 'deprecated']).optional(),
  cluster:  z.enum(['mentolder', 'korczewski', 'both']).optional(),
  url:      z.url().nullable().optional(),
  hostname: z.string().max(100).nullable().optional(),
  notes:    z.string().max(500).nullable().optional(),
});

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('forbidden', { status: 403 });

  const sp = url.searchParams;
  const components = await listComponents({
    kind:    sp.get('kind')    ?? undefined,
    cluster: sp.get('cluster') ?? undefined,
    status:  sp.get('status')  ?? undefined,
    q:       sp.get('q')       ?? undefined,
    limit:   sp.get('limit')   ? parseInt(sp.get('limit')!, 10)  : undefined,
    offset:  sp.get('offset')  ? parseInt(sp.get('offset')!, 10) : undefined,
  });
  return new Response(JSON.stringify({ components }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('forbidden', { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) return new Response(JSON.stringify(parsed.error.flatten()), { status: 400 });

  const row = await createComponent(parsed.data);
  return new Response(JSON.stringify(row), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
};
