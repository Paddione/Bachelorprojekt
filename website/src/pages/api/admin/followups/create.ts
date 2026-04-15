import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createFollowUp } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form        = await request.formData();
  const reason      = (form.get('reason') as string)?.trim();
  const dueDate     = form.get('dueDate') as string;
  const clientName  = form.get('clientName') as string | null;
  const clientEmail = form.get('clientEmail') as string | null;
  const userId      = form.get('keycloakUserId') as string | null;
  const back        = form.get('_back') as string | null;

  if (!reason || !dueDate) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${back || '/admin/followups'}?error=${encodeURIComponent('Grund und Datum erforderlich')}` },
    });
  }

  try {
    await createFollowUp({
      reason, dueDate,
      keycloakUserId: userId || undefined,
      clientName: clientName || undefined,
      clientEmail: clientEmail || undefined,
    });
  } catch (err) {
    console.error('[api/followups/create]', err);
    return new Response(null, {
      status: 302,
      headers: { Location: `${back || '/admin/followups'}?error=${encodeURIComponent('Datenbankfehler')}` },
    });
  }

  return new Response(null, { status: 302, headers: { Location: `${back || '/admin/followups'}?saved=1` } });
};
