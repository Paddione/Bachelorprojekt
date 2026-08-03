import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { hasRunningJob, spawnTestRun } from '../../../../lib/test-runner';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (hasRunningJob()) {
    return new Response(JSON.stringify({ error: 'A test run is already in progress' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { tier?: string; testIds?: string[] };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const tier = body.tier === 'local' ? 'local' : 'prod';
  const testIds = Array.isArray(body.testIds)
    ? body.testIds.filter((id) => /^[A-Z]+-\d+(-init)?$/.test(id))
    : [];

  const jobId = await spawnTestRun(tier, testIds);
  return new Response(JSON.stringify({ jobId }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
