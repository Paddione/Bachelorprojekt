import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import { getSession, isAdmin } from '../../../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  await new Promise<void>((resolve) => {
    const proc = spawn('bash', ['tests/runner.sh', 'report'], { cwd: '/app' });
    proc.on('exit', () => resolve());
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
