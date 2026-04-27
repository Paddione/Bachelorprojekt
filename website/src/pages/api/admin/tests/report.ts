import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import { getSession, isAdmin } from '../../../../lib/auth';

const REPORT_TIMEOUT_MS = 60_000;

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const code = await new Promise<number | null>((resolve) => {
    const proc = spawn('bash', ['tests/runner.sh', 'report'], { cwd: '/app' });
    proc.stderr!.resume();
    const timer = setTimeout(() => { proc.kill(); resolve(null); }, REPORT_TIMEOUT_MS);
    proc.on('exit', (c) => { clearTimeout(timer); resolve(c); });
  });

  if (code !== 0) {
    return new Response(JSON.stringify({ ok: false, code }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
