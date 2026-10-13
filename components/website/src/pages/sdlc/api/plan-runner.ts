import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { autoSlots, parseManifestPartials } from '../../../lib/sdlc/plan-slots';

export const prerender = false;

// Liest nur: Slot-Vorschlag für einen gestagten Plan (.agents/plans/<slug>/tasks.md).
// Startet nichts — der angezeigte Befehl läuft auf der Box mit GPU-Services,
// die der Leitstand-Container nicht sieht.
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const slug = (new URL(request.url).searchParams.get('slug') ?? '').trim();
  if (!SLUG_RE.test(slug)) {
    return json({ error: 'ungültiger Plan-Slug' }, 400);
  }

  let raw: string;
  try {
    raw = await readFile(join(process.cwd(), '..', '..', '.agents', 'plans', slug, 'tasks.md'), 'utf-8');
  } catch {
    return json({ error: 'Plan nicht gefunden' }, 404);
  }

  try {
    const partials = parseManifestPartials(raw);
    return json({ slug, partials: partials.length, ...autoSlots(partials) }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Manifest ungültig' }, 422);
  }
};
