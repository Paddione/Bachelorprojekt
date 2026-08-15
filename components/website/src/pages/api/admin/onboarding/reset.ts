import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { resetOnboardingChecklist } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form   = await request.formData();
  const userId = form.get('keycloakUserId') as string;
  const back   = form.get('_back') as string | null;

  if (userId) await resetOnboardingChecklist(userId);

  return new Response(null, { status: 302, headers: { Location: back || '/admin' } });
};
