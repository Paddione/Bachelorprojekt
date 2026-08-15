import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSession, isAdmin } from '../../../../lib/auth';

export const prerender = false;

const execFileAsync = promisify(execFile);

interface SessionEntry {
  slug: string;
  type: string;
  title: string;
  port: number;
  public_url: string;
  local_url: string;
  started_at: string;
}

function registryPath(): string {
  return process.env.SESSION_HUB_REGISTRY
    ?? `${homedir()}/.local/share/bachelorprojekt/active-sessions.json`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authGuard(session: Awaited<ReturnType<typeof getSession>>): Response | null {
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

async function readRegistry(): Promise<SessionEntry[]> {
  try {
    const raw = await readFile(registryPath(), 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SessionEntry[]) : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    throw err;
  }
}

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;
  try {
    return json({ sessions: await readRegistry() }, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/sessions] GET error:');
    return json({ error: 'read_failed' }, 500);
  }
};

async function runHub(args: string[], locals: App.Locals): Promise<Response> {
  if (process.env.SESSION_HUB_REGISTRY_WRITABLE !== 'true') {
    return json({ error: 'not_implemented', detail: 'registry is read-only in this environment' }, 501);
  }
  try {
    await execFileAsync('bash', ['scripts/session-hub.sh', ...args], { timeout: 15_000 });
    return json({ sessions: await readRegistry() }, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/sessions] hub error:');
    return json({ error: 'hub_failed' }, 500);
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }
  const name = String(body.name ?? '').trim();
  const port = String(body.port ?? '').trim();
  if (!name || !/^\d+$/.test(port)) return json({ error: 'name_and_port_required' }, 400);
  const type = String(body.type ?? 'companion').trim();
  const title = String(body.title ?? name).trim();
  return runHub(['register', '--name', name, '--port', port, '--type', type, '--title', title], locals);
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;
  const slug = new URL(request.url).searchParams.get('slug')?.trim();
  if (!slug) return json({ error: 'slug_required' }, 400);
  return runHub(['deregister', '--name', slug], locals);
};
