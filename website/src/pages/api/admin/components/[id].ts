// website/src/pages/api/admin/components/[id].ts
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updateComponent, deleteComponent } from '../../../../lib/components-db';

export const prerender = false;

const PatchBody = z.object({
  name:     z.string().min(1).max(100).optional(),
  kind:     z.enum(['physical', 'non-physical']).optional(),
  area:     z.string().min(1).max(50).optional(),
  status:   z.enum(['active', 'inactive', 'deprecated']).optional(),
  cluster:  z.enum(['mentolder', 'korczewski', 'both']).optional(),
  url:      z.url().nullable().optional(),
  hostname: z.string().max(100).nullable().optional(),
  notes:    z.string().max(500).nullable().optional(),
});

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('forbidden', { status: 403 });

  const id = parseInt(params.id ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) return new Response('bad id', { status: 400 });

  let body: unknown;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) return new Response(JSON.stringify(parsed.error.flatten()), { status: 400 });
  if (Object.keys(parsed.data).length === 0) return new Response('nothing to update', { status: 400 });

  const row = await updateComponent(id, parsed.data);
  if (!row) return new Response('not found', { status: 404 });
  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('forbidden', { status: 403 });

  const id = parseInt(params.id ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) return new Response('bad id', { status: 400 });

  const ok = await deleteComponent(id);
  if (!ok) return new Response('not found', { status: 404 });
  return new Response(null, { status: 204 });
};
