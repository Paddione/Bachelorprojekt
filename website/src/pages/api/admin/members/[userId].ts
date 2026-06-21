import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getLearningProgress, getOnboardingState } from '../../../../lib/learning-db';
import { getUserById } from '../../../../lib/identity';

export const GET: APIRoute = async ({ request, params , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = params.userId;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Missing userId' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const brand = session.brand ?? 'mentolder';

  const kcUser = await getUserById(userId).catch(() => null);
  if (!kcUser) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  let learning_progress, onboarding_state;
  try {
    [learning_progress, onboarding_state] = await Promise.all([
      getLearningProgress(userId, brand),
      getOnboardingState(userId, brand),
    ]);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/members/[userId]] DB error:');
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      user: {
        id: kcUser.id,
        username: kcUser.username,
        email: kcUser.email ?? null,
        firstName: kcUser.firstName ?? null,
        lastName: kcUser.lastName ?? null,
      },
      learning_progress,
      onboarding_state,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
