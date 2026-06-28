import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getArchivedMarkdown } from '../../../../../lib/sessions/archive';

export const prerender = false;

function getArchiveDir(): string {
  const p = process.env.SESSIONS_ARCHIVE_DIR;
  if (p) return p;
  return join(homedir(), '.local/share/bachelorprojekt/sessions-archive');
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request, params, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { id } = params;
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    return json({ error: 'Invalid ID' }, 400);
  }

  const archiveDir = getArchiveDir();
  const metaPath = join(archiveDir, `${id}.meta.json`);

  let meta: { owner?: string };
  try {
    const rawMeta = await readFile(metaPath, 'utf8');
    meta = JSON.parse(rawMeta) as { owner?: string };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return json({ error: 'Not Found' }, 404);
    }
    locals.requestLogger.error({ err }, `[api/admin/sessions/history/${id}] failed to read meta:`);
    return json({ error: 'Read error' }, 500);
  }

  // Auth check: Admin sees all, user only their own
  const viewer = session.preferred_username || 'unknown';
  if (!isAdmin(session) && meta.owner !== viewer) {
    return json({ error: 'Forbidden' }, 403);
  }

  const markdown = await getArchivedMarkdown(id);
  if (markdown === null) {
    return json({ error: 'Not Found' }, 404);
  }

  return new Response(markdown, {
    status: 200,
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
