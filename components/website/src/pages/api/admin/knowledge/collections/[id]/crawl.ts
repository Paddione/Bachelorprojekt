import type { APIRoute } from 'astro';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getCollection } from '../../../../../../lib/knowledge-db';
import { errorResponse } from '../../../../_errors';

// Module-level set: tracks collection IDs currently being crawled.
// Cleared when the spawned process exits.
const activeCrawls = new Set<string>();

export const POST: APIRoute = async ({ request, params , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = params.id!;

  const c = await getCollection(id);
  if (!c) return errorResponse('not_found', locals.requestId, 404);
  if (c.source !== 'web_crawl') {
    return new Response(
      JSON.stringify({ error: 'Nur web_crawl-Sammlungen können gecrawlt werden' }),
      { status: 400 },
    );
  }
  if (!c.crawl_config?.startUrl) {
    return new Response(
      JSON.stringify({ error: 'Keine startUrl konfiguriert. Bitte erst Crawl-Konfiguration speichern.' }),
      { status: 422 },
    );
  }

  if (activeCrawls.has(id)) {
    return new Response(
      JSON.stringify({ error: 'Crawl läuft bereits für diese Sammlung' }),
      { status: 409 },
    );
  }

  const repoRoot   = process.env.REPO_ROOT ?? resolve(new URL(import.meta.url).pathname, '../../../../../../../../../');
  const scriptPath = resolve(repoRoot, 'scripts/knowledge/ingest-web.mjs');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    COLLECTION_ID: id,
    PGURL: process.env.SESSIONS_DATABASE_URL
        ?? 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website',
  };

  activeCrawls.add(id);
  const child = spawn('node', [scriptPath], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  child.stdout.on('data', (d: Buffer) => process.stdout.write(`[crawl:${id.slice(0,8)}] ${d}`));
  child.stderr.on('data', (d: Buffer) => process.stderr.write(`[crawl:${id.slice(0,8)}] ${d}`));

  child.on('close', (code: number | null) => {
    activeCrawls.delete(id);
    if (code !== 0) {
      locals.requestLogger.error(`[crawl] ${id} exited with code ${code}`);
    } else {
      locals.requestLogger.info(`[crawl] ${id} completed successfully`);
    }
  });

  return new Response(
    JSON.stringify({ message: 'Crawl gestartet', collectionId: id }),
    { status: 202, headers: { 'Content-Type': 'application/json' } },
  );
};

export const GET: APIRoute = async ({ request, params , locals: _locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const id = params.id!;
  return new Response(
    JSON.stringify({ running: activeCrawls.has(id) }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
