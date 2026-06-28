import type { APIRoute } from 'astro';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getCollection } from '../../../../../../lib/knowledge-db';
import { errorResponse } from '../../../../_errors';

const activeIngests = new Set<string>();

export const POST: APIRoute = async ({ request, params , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = params.id!;

  const c = await getCollection(id);
  if (!c) return errorResponse('not_found', locals.requestId, 404);
  if (c.source !== 'context7_docs') {
    return new Response(
      JSON.stringify({ error: 'Nur context7_docs-Sammlungen können über diesen Endpunkt indiziert werden' }),
      { status: 400 },
    );
  }

  const cfg = c.crawl_config as { libraryId?: string; tokens?: number } | null;
  if (!cfg?.libraryId) {
    return new Response(
      JSON.stringify({ error: 'Keine libraryId konfiguriert. Bitte erst Context7-Konfiguration speichern.' }),
      { status: 422 },
    );
  }

  if (activeIngests.has(id)) {
    return new Response(
      JSON.stringify({ error: 'Indizierung läuft bereits für diese Sammlung' }),
      { status: 409 },
    );
  }

  const repoRoot   = process.env.REPO_ROOT ?? resolve(new URL(import.meta.url).pathname, '../../../../../../../../../');
  const scriptPath = resolve(repoRoot, 'scripts/knowledge/ingest-context7.mjs');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    COLLECTION_ID: id,
    LIBRARY_ID:    cfg.libraryId,
    TOKENS:        String(cfg.tokens ?? 20000),
    PGURL: process.env.SESSIONS_DATABASE_URL
        ?? 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website',
  };

  activeIngests.add(id);
  const child = spawn('node', [scriptPath], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  child.stdout.on('data', (d: Buffer) => process.stdout.write(`[context7:${id.slice(0,8)}] ${d}`));
  child.stderr.on('data', (d: Buffer) => process.stderr.write(`[context7:${id.slice(0,8)}] ${d}`));

  child.on('close', (code: number | null) => {
    activeIngests.delete(id);
    if (code !== 0) {
      locals.requestLogger.error(`[context7] ${id} exited with code ${code}`);
    } else {
      locals.requestLogger.info(`[context7] ${id} completed successfully`);
    }
  });

  return new Response(
    JSON.stringify({ message: 'Indizierung gestartet', collectionId: id, libraryId: cfg.libraryId }),
    { status: 202, headers: { 'Content-Type': 'application/json' } },
  );
};

export const GET: APIRoute = async ({ request, params , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const id = params.id!;
  return new Response(
    JSON.stringify({ running: activeIngests.has(id) }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
