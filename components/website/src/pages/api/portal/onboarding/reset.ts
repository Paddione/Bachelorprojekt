import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { resetOnboardingChecklist } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(null, { status: 401 });

  const form = await request.formData();
  const back = form.get('_back') as string | null;

  // Reset the checklist for the current user (not an arbitrary userId from the form)
  await resetOnboardingChecklist(session.sub);

  return new Response(null, { status: 302, headers: { Location: back || '/portal' } });
};
