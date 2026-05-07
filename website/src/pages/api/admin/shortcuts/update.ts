import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updateAdminShortcut } from '../../../../lib/website-db';

export const PATCH: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let id = '';
  let url: string | undefined;
  let label: string | undefined;
  try {
    const body = await request.json();
    id = String(body?.id ?? '').trim();
    if (typeof body?.url === 'string')   url = body.url.trim();
    if (typeof body?.label === 'string') label = body.label.trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!id) {
    return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  }
  if (url !== undefined && !url.startsWith('https://')) {
    return new Response(JSON.stringify({ error: 'url must start with https://' }), { status: 400 });
  }
  if (url !== undefined && url.length > 2048) {
    return new Response(JSON.stringify({ error: 'url too long' }), { status: 400 });
  }
  if (label !== undefined && (!label || label.length > 120)) {
    return new Response(JSON.stringify({ error: 'label is required (max 120 chars)' }), { status: 400 });
  }
  if (url === undefined && label === undefined) {
    return new Response(JSON.stringify({ error: 'nothing to update' }), { status: 400 });
  }

  try {
    const updated = await updateAdminShortcut(id, { url, label });
    if (!updated) {
      return new Response(JSON.stringify({ error: 'Shortcut not found' }), { status: 404 });
    }
    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[shortcuts/update]', err);
    return new Response(JSON.stringify({ error: err.message ?? 'DB error' }), { status: 500 });
  }
};
