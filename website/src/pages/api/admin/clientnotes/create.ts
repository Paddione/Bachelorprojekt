import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createClientNote } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form    = await request.formData();
  const userId  = form.get('keycloakUserId') as string;
  const content = (form.get('content') as string)?.trim();
  const back    = form.get('_back') as string | null;

  if (!userId || !content) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${back || '/admin'}?error=${encodeURIComponent('Notiz darf nicht leer sein')}` },
    });
  }

  try {
    await createClientNote(userId, content);
  } catch (err) {
    console.error('[api/clientnotes/create]', err);
    return new Response(null, {
      status: 302,
      headers: { Location: `${back || '/admin'}?error=${encodeURIComponent('Datenbankfehler')}` },
    });
  }

  return new Response(null, { status: 302, headers: { Location: `${back || '/admin'}?saved=1` } });
};
