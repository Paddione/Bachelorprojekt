import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updateFollowUp } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 401 });

  const form    = await request.formData();
  const id      = form.get('id') as string;
  const done    = form.get('done');
  const dueDate = form.get('dueDate') as string | null;
  const reason  = form.get('reason') as string | null;
  const back    = form.get('_back') as string | null;

  if (!id) return new Response(null, { status: 302, headers: { Location: back || '/admin/followups' } });

  await updateFollowUp(id, {
    done: done !== null ? done === 'true' : undefined,
    dueDate: dueDate || undefined,
    reason: reason || undefined,
  });

  return new Response(null, { status: 302, headers: { Location: back || '/admin/followups' } });
};
