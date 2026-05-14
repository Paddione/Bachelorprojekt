import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSession, isAdmin } from '../../../../lib/auth';
import { overrideEvent, trackingPool as pool } from '../../../../lib/software-history-db';

export const prerender = false;

const PatchBody = z.object({
  service: z.string().min(1).max(64),
  area:    z.string().min(1).max(32),
  kind:    z.enum(['added','removed','changed','irrelevant']),
  notes:   z.string().max(500).nullable().optional(),
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

  const row = await overrideEvent(pool, id, {
    service: parsed.data.service,
    area:    parsed.data.area,
    kind:    parsed.data.kind,
    notes:   parsed.data.notes ?? null,
  });
  if (!row) return new Response('not found', { status: 404 });
  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
