import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { deleteClientNote } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const form = await request.formData();
  const id   = form.get('id') as string;
  const back = form.get('_back') as string | null;

  if (id) await deleteClientNote(id);

  return new Response(null, { status: 302, headers: { Location: back || '/admin' } });
};
