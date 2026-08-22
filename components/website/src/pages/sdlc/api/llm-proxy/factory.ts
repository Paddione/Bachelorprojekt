import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import {
  readFactoryDefault,
  writeFactoryDefault,
  FactoryProxyOfflineError,
  FactoryWriteConflictError,
} from '../../../../lib/sdlc/llm-proxy-factory';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  try {
    const data = await readFactoryDefault();
    return json(data);
  } catch (err) {
    // Offline wird ausdrücklich benannt — kein leerer Default darf einen
    // nicht erreichbaren Proxy vortäuschen.
    locals?.requestLogger?.warn(
      { err },
      '[sdlc/api/llm-proxy/factory] GET: proxy unreachable',
    );
    return json({ error: 'proxy_unreachable', message: 'llm-proxy nicht erreichbar', model: null }, 503);
  }
};

interface FactoryPutBody {
  model?: unknown;
  locked?: unknown;
  mtimeMs?: unknown;
}

export const PUT: APIRoute = async ({ request, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;

  let body: FactoryPutBody;
  try {
    body = (await request.json()) as FactoryPutBody;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (typeof body.model !== 'string' || !body.model.trim()) {
    return json({ error: 'invalid_model' }, 400);
  }

  try {
    const result = await writeFactoryDefault(
      body.model.trim(),
      body.locked === true,
      typeof body.mtimeMs === 'number' ? body.mtimeMs : 0,
    );
    return json(result);
  } catch (err) {
    if (err instanceof FactoryWriteConflictError) {
      // Konkurrierender Schreibzugriff — als eigener Konflikt sichtbar machen,
      // nicht als generisches Versagen verschwinden lassen.
      return json(
        { error: 'stale_factory_write', message: err.message },
        409,
      );
    }
    if (err instanceof FactoryProxyOfflineError) {
      return json({ error: 'proxy_unreachable', message: err.message }, 503);
    }
    locals?.requestLogger?.error(
      { err },
      '[sdlc/api/llm-proxy/factory] PUT failed',
    );
    return json({ error: 'factory_write_failed' }, 500);
  }
};
