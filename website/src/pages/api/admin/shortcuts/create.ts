import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createAdminShortcut } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let url: string, label: string;
  try {
    const body = await request.json();
    url = (body.url ?? '').trim();
    label = (body.label ?? '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!url.startsWith('https://') || !label) {
    return new Response(JSON.stringify({ error: 'url (https) and label required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const shortcut = await createAdminShortcut(url, label);
    return new Response(JSON.stringify(shortcut), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[shortcuts/create]', err);
    return new Response(JSON.stringify({ error: 'DB error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
